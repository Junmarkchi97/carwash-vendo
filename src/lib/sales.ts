import type { Collection, Document, Filter, ObjectId, OptionalUnlessRequiredId } from "mongodb";
import { getCustomerDetailsByJcards } from "./customers";
import { getDb } from "./db";
import { getJcardTapChargePesos } from "./settings";

/** One coin-slot unit in sales_events is this many PHP (vendo physical slot). */
export function coinSlotPricePhp(): number {
  const raw = process.env.COIN_SLOT_PRICE_PHP;
  const n = raw !== undefined ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

const COLLECTION = "sales_events";

/**
 * MongoDB collection `sales_events` (see `getDb()` for database name).
 *
 * **Canonical document** (every insert from this app):
 * | Field       | Type                         |
 * |------------|------------------------------|
 * | `_id`      | ObjectId                     |
 * | `createdAt`| Date                         |
 * | `source`   | `"coin"` \| `"jcard"`        |
 * | `price`    | number (line total, PHP)     |
 * | `jcard`    | string (card UID; JCard rows only) |
 *
 * **Legacy** rows may lack `source` / `price` and use older keys; {@link saleLineRevenuePhp}
 * and {@link revenuePerDocExpr} still honor `price_charged`, `amountPhp`, `quantity`×rates,
 * and `jcard` / `rfid` for classification and totals.
 */

/** Shape written by {@link recordSale} / {@link recordRfidTapEvent} (Mongo adds `_id`). */
export type SalesEventInsertDoc = {
  createdAt: Date;
  source: "coin" | "jcard";
  price: number;
  /** Card UID from device; only set when {@link source} is `"jcard"`. */
  jcard?: string;
};

/** Fields only present on older documents (read when computing revenue / source). */
export type SalesEventLegacyFields = {
  /** Superseded by `price`; still read for existing documents. */
  price_charged?: number;
  quantity?: number;
  amountPhp?: number;
  jcard?: string;
  rfid?: string;
};

/** Document as loaded from Mongo (canonical + optional legacy). */
export type SalesEventDoc = {
  _id: ObjectId;
  createdAt: Date;
  source?: "coin" | "jcard";
  /** Line total PHP when present (all new rows). */
  price?: number;
} & SalesEventLegacyFields;

/** Projection for queries that only need fields used by {@link saleLineRevenuePhp} and {@link isJcardSale}. */
const SALES_EVENT_READ_PROJECTION = {
  createdAt: 1,
  source: 1,
  price: 1,
  price_charged: 1,
  quantity: 1,
  amountPhp: 1,
  jcard: 1,
  rfid: 1,
} as const;

export type SalesSourceFilter = "all" | "coin" | "jcard";

export function parseSalesSourceFilter(raw: string | undefined): SalesSourceFilter {
  if (raw === "coin" || raw === "jcard") return raw;
  if (raw === "rfid") return "jcard";
  return "all";
}

/** JCard row: explicit `source`, or legacy doc with jcard/rfid uid. */
export function isJcardSale(doc: Pick<SalesEventDoc, "source" | "jcard" | "rfid">): boolean {
  if (doc.source === "jcard") return true;
  if (doc.source === "coin") return false;
  const j = typeof doc.jcard === "string" && doc.jcard.trim() !== "";
  if (j) return true;
  return typeof doc.rfid === "string" && doc.rfid.trim() !== "";
}

function salesSourceMongoFilter(filter: SalesSourceFilter): Filter<SalesEventDoc> | undefined {
  if (filter === "all") return undefined;
  if (filter === "jcard") {
    return {
      $or: [
        { source: "jcard" as const },
        {
          $and: [
            { $or: [{ source: { $exists: false } }, { source: null }] },
            {
              $or: [
                { jcard: { $exists: true, $nin: [null, ""] } },
                { rfid: { $exists: true, $nin: [null, ""] } },
              ],
            },
          ],
        },
      ],
    } as Filter<SalesEventDoc>;
  }
  return {
    $or: [
      { source: "coin" as const },
      {
        $and: [
          { $or: [{ source: { $exists: false } }, { source: null }] },
          { $or: [{ jcard: { $exists: false } }, { jcard: null }, { jcard: "" }] },
          { $or: [{ rfid: { $exists: false } }, { rfid: null }, { rfid: "" }] },
        ],
      },
    ],
  } as Filter<SalesEventDoc>;
}

function matchWithSource(
  filter: SalesSourceFilter,
  base: Filter<SalesEventDoc>,
): Filter<SalesEventDoc> {
  const src = salesSourceMongoFilter(filter);
  if (!src) return base;
  const baseKeys = Object.keys(base as object).length;
  if (baseKeys === 0) return src;
  return { $and: [base, src] };
}

function isJcardExpr(): Document {
  return {
    $or: [
      { $eq: ["$source", "jcard"] },
      { $gt: [{ $strLenCP: { $ifNull: ["$jcard", ""] } }, 0] },
      { $gt: [{ $strLenCP: { $ifNull: ["$rfid", ""] } }, 0] },
    ],
  };
}

/** Revenue in PHP: `price`, else legacy `price_charged` / `amountPhp`, else `quantity`×rates. */
export function saleLineRevenuePhp(
  doc: SalesEventDoc,
  coinPhp: number,
  jcardTapPhp: number,
): number {
  const p = doc.price;
  if (typeof p === "number" && Number.isFinite(p) && p >= 0) {
    return p;
  }
  const pc = doc.price_charged;
  if (typeof pc === "number" && Number.isFinite(pc) && pc >= 0) {
    return pc;
  }
  const legacy =
    typeof doc.amountPhp === "number" && Number.isFinite(doc.amountPhp) && doc.amountPhp >= 0
      ? doc.amountPhp
      : undefined;
  if (legacy !== undefined) return legacy;
  const q = doc.quantity ?? 0;
  if (isJcardSale(doc)) {
    return q * jcardTapPhp;
  }
  return q * coinPhp;
}

/** Aggregation mirror of {@link saleLineRevenuePhp} (same field precedence). */
function revenuePerDocExpr(coinSlotPhp: number, jcardTapPhp: number): Document {
  return {
    $ifNull: [
      "$price",
      {
        $ifNull: [
          "$price_charged",
          {
            $ifNull: [
              "$amountPhp",
              {
                $multiply: [
                  { $ifNull: ["$quantity", 0] },
                  { $cond: [isJcardExpr(), jcardTapPhp, coinSlotPhp] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function aggregateTotalPhp(
  coll: Collection<SalesEventDoc>,
  match: Filter<SalesEventDoc>,
  coinSlotPhp: number,
  jcardTapPhp: number,
): Promise<number> {
  const pipeline: Document[] = [
    { $match: match },
    { $addFields: { _rev: revenuePerDocExpr(coinSlotPhp, jcardTapPhp) } },
    { $group: { _id: null, total: { $sum: "$_rev" } } },
  ];
  const [row] = await coll.aggregate<{ total: number }>(pipeline as never).toArray();
  return row?.total ?? 0;
}

let indexesEnsured: Promise<void> | null = null;

async function getSalesCollection(): Promise<Collection<SalesEventDoc>> {
  const db = await getDb();
  const coll = db.collection<SalesEventDoc>(COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = Promise.all([
      coll.createIndex({ createdAt: -1 }),
      coll.createIndex({ source: 1, createdAt: -1 }),
    ]).then(() => {});
  }
  await indexesEnsured;
  return coll;
}

/**
 * Latest JCard tap time per card UID from `sales_events` (canonical `jcard` or legacy `rfid`).
 */
export async function getLastJcardUseAtByJcards(
  jcards: string[],
): Promise<Map<string, Date>> {
  const uniq = [...new Set(jcards.map((j) => j.trim()).filter(Boolean))];
  const map = new Map<string, Date>();
  if (uniq.length === 0) return map;

  const coll = await getSalesCollection();
  const jcardOnly = salesSourceMongoFilter("jcard");
  if (!jcardOnly) return map;

  const pipeline: Document[] = [
    { $match: jcardOnly },
    {
      $addFields: {
        cardUid: {
          $trim: {
            input: {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$jcard", ""] } }, 0] },
                { $ifNull: ["$jcard", ""] },
                { $ifNull: ["$rfid", ""] },
              ],
            },
          },
        },
      },
    },
    { $match: { cardUid: { $in: uniq } } },
    { $group: { _id: "$cardUid", lastUsedAt: { $max: "$createdAt" } } },
  ];

  const rows = await coll
    .aggregate<{ _id: string; lastUsedAt: Date }>(pipeline as never)
    .toArray();

  for (const row of rows) {
    const id = typeof row._id === "string" ? row._id.trim() : String(row._id);
    const t = row.lastUsedAt;
    if (!id || !(t instanceof Date) || Number.isNaN(t.getTime())) continue;
    map.set(id, t);
  }
  return map;
}

function localDayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last 7 local calendar days as YYYY-MM-DD (oldest first). */
export function getLast7LocalDayKeys(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    t.setDate(t.getDate() - i);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
  }
  return days;
}

export type SalesEventRow = {
  id: string;
  createdAt: Date;
  revenuePhp: number;
  source: "coin" | "jcard";
  /** Card UID for JCard sales; `null` for coin or legacy rows without id. */
  jcardId: string | null;
  /** From customers collection when `jcardId` matches. */
  customerName: string | null;
  /** Current stored balance (PHP) when customer doc exists; not historical at sale time. */
  customerBalancePhp: number | null;
  /** Customer record created/joined date when known (from fields or `_id`). */
  customerJoinedAt: Date | null;
  /** Most recent JCard tap in `sales_events` for this card (any time). */
  customerLastJcardUseAt: Date | null;
};

export type RecordSaleOptions = {
  /** Line total PHP (e.g. RFID tap charge). Overrides computed total. */
  price?: number;
};

/**
 * One successful RFID tap → `sales_events` row (`source: jcard`, `price`, `jcard`).
 */
export async function recordRfidTapEvent(jcardUid: string, chargePhp: number) {
  const charge = Math.round(chargePhp);
  if (!Number.isFinite(charge) || charge < 1) {
    throw new Error("recordRfidTapEvent: chargePhp must be a positive integer (PHP)");
  }
  return recordSale(jcardUid, { price: charge });
}

/** One sale event (one tap or one coin-slot unit). */
export async function recordSale(
  jcard?: string | null,
  options?: RecordSaleOptions,
): Promise<{
  id: string;
  createdAt: Date;
  source: "jcard" | "coin";
  price: number;
}> {
  const coll = await getSalesCollection();
  const createdAt = new Date();
  const trimmed = jcard?.trim();
  const isJcard = Boolean(trimmed);

  let price: number;
  if (options?.price != null && Number.isFinite(options.price)) {
    price = Math.round(options.price);
  } else if (isJcard) {
    const { value } = await getJcardTapChargePesos();
    price = Math.round(value);
  } else {
    price = Math.round(coinSlotPricePhp());
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("recordSale: invalid price");
  }

  /**
   * Same physical tap often hits both `POST /api/jcard/tap` (logs after balance deduct) and
   * `POST /api/sales` with `jcard` — each path calls `recordSale`, which used to insert twice.
   * Reuse the recent row instead of inserting again (balance was only deducted once on tap).
   */
  if (isJcard && trimmed) {
    const rawMs = process.env.JCARD_SALES_DEDUPE_MS;
    const dedupeMs =
      rawMs === undefined || rawMs === "" ? 4000 : Math.max(0, Number(rawMs));
    if (Number.isFinite(dedupeMs) && dedupeMs > 0) {
      const since = new Date(createdAt.getTime() - dedupeMs);
      const dup = await coll.findOne(
        {
          jcard: trimmed,
          price,
          createdAt: { $gte: since },
        },
        { sort: { createdAt: -1 }, projection: { _id: 1, createdAt: 1 } },
      );
      if (dup?._id && dup.createdAt) {
        return {
          id: dup._id.toHexString(),
          createdAt: dup.createdAt,
          source: "jcard" as const,
          price,
        };
      }
    }
  }

  const doc: SalesEventInsertDoc = {
    createdAt,
    source: isJcard ? "jcard" : "coin",
    price,
    ...(isJcard && trimmed ? { jcard: trimmed } : {}),
  };

  const result = await coll.insertOne(doc as OptionalUnlessRequiredId<SalesEventDoc>);
  return {
    id: result.insertedId.toHexString(),
    createdAt,
    source: doc.source,
    price,
  };
}

export type CoinJcardDayRow = {
  day: string;
  label: string;
  shortLabel: string;
  coin: number;
  jcard: number;
};

function formatDayShort(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });
}

/** Grouped series for the comparison chart (coin + JCard, last 7 local days). */
export async function getCoinJcardDailyLast7(): Promise<CoinJcardDayRow[]> {
  const coll = await getSalesCollection();
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const docs = await coll
    .find({ createdAt: { $gte: weekStart } })
    .project(SALES_EVENT_READ_PROJECTION)
    .toArray();

  const dayKeys = getLast7LocalDayKeys();
  const coinByDay = new Map<string, number>();
  const jcardByDay = new Map<string, number>();

  const coinSlot = coinSlotPricePhp();
  const { value: jcardTap } = await getJcardTapChargePesos();

  for (const row of docs) {
    const doc = row as SalesEventDoc;
    const key = localDateKey(doc.createdAt);
    const rev = saleLineRevenuePhp(doc, coinSlot, jcardTap);
    if (isJcardSale(doc)) {
      jcardByDay.set(key, (jcardByDay.get(key) ?? 0) + rev);
    } else {
      coinByDay.set(key, (coinByDay.get(key) ?? 0) + rev);
    }
  }

  return dayKeys.map((day) => {
    const label = formatDayShort(day);
    const parts = label.split(",").map((s) => s.trim());
    const shortLabel = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : label;
    return {
      day,
      label,
      shortLabel,
      coin: coinByDay.get(day) ?? 0,
      jcard: jcardByDay.get(day) ?? 0,
    };
  });
}

export async function getDashboardStats(
  sourceFilter: SalesSourceFilter = "all",
  pricing: { coinSlotPhp: number; jcardTapPhp: number },
) {
  const coll = await getSalesCollection();
  const { coinSlotPhp, jcardTapPhp } = pricing;

  const { start: todayStart, end: todayEnd } = localDayBounds();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const baseToday: Filter<SalesEventDoc> = { createdAt: { $gte: todayStart, $lt: todayEnd } };
  const baseWeek: Filter<SalesEventDoc> = { createdAt: { $gte: weekAgo } };

  const matchAll = matchWithSource(sourceFilter, {} as Filter<SalesEventDoc>);
  const [totalAllTimePhp, totalTodayPhp, totalLast7DaysPhp] = await Promise.all([
    aggregateTotalPhp(coll, matchAll, coinSlotPhp, jcardTapPhp),
    aggregateTotalPhp(coll, matchWithSource(sourceFilter, baseToday), coinSlotPhp, jcardTapPhp),
    aggregateTotalPhp(coll, matchWithSource(sourceFilter, baseWeek), coinSlotPhp, jcardTapPhp),
  ]);

  const recentDocs = await coll
    .find(matchWithSource(sourceFilter, {}))
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();

  const recentBase = recentDocs.map((d) => {
    const source = d.source ?? (isJcardSale(d) ? "jcard" : "coin");
    const jc =
      typeof d.jcard === "string" && d.jcard.trim() !== ""
        ? d.jcard.trim()
        : typeof d.rfid === "string" && d.rfid.trim() !== ""
          ? d.rfid.trim()
          : null;
    return {
      id: d._id.toHexString(),
      createdAt: d.createdAt,
      revenuePhp: saleLineRevenuePhp(d, coinSlotPhp, jcardTapPhp),
      source: source as "coin" | "jcard",
      jcardId: source === "jcard" ? jc : null,
    };
  });

  const jcardsForDetails = recentBase
    .map((r) => r.jcardId)
    .filter((jc): jc is string => jc != null);
  const [detailsByJcard, lastUseByJcard] = await Promise.all([
    getCustomerDetailsByJcards(jcardsForDetails),
    getLastJcardUseAtByJcards(jcardsForDetails),
  ]);

  const recent: SalesEventRow[] = recentBase.map((r) => {
    const d = r.jcardId ? detailsByJcard.get(r.jcardId) : undefined;
    const lastUse = r.jcardId ? lastUseByJcard.get(r.jcardId) : undefined;
    return {
      ...r,
      customerName: d?.name ?? null,
      customerBalancePhp: d !== undefined ? d.balancePhp : null,
      customerJoinedAt: d !== undefined ? d.joinedAt : null,
      customerLastJcardUseAt: lastUse ?? null,
    };
  });

  return {
    totalAllTimePhp,
    totalTodayPhp,
    totalLast7DaysPhp,
    recent,
  };
}
