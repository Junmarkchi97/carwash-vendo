import type { Collection, Filter, ObjectId, OptionalUnlessRequiredId } from "mongodb";
import { getDb } from "./db";

const COLLECTION = "sales_events";

type SalesEventDoc = {
  _id: ObjectId;
  createdAt: Date;
  quantity: number;
  /** JCard UID when the sale is from a tap. */
  jcard?: string;
  /** @deprecated Legacy field; still read for older rows. */
  rfid?: string;
  /** Set for ₱5 coin slot when there is no JCard. */
  source?: "coin";
};

export type SalesSourceFilter = "all" | "coin" | "jcard";

export function parseSalesSourceFilter(raw: string | undefined): SalesSourceFilter {
  if (raw === "coin" || raw === "jcard") return raw;
  if (raw === "rfid") return "jcard";
  return "all";
}

/** True when this row is a JCard sale (non-empty jcard, or legacy rfid). */
export function isJcardSale(doc: Pick<SalesEventDoc, "jcard" | "rfid">): boolean {
  const j = typeof doc.jcard === "string" && doc.jcard.trim() !== "";
  if (j) return true;
  return typeof doc.rfid === "string" && doc.rfid.trim() !== "";
}

function salesSourceMongoFilter(filter: SalesSourceFilter): Filter<SalesEventDoc> | undefined {
  if (filter === "all") return undefined;
  if (filter === "jcard") {
    return {
      $or: [
        { jcard: { $exists: true, $nin: [null, ""] } },
        { rfid: { $exists: true, $nin: [null, ""] } },
      ],
    } as Filter<SalesEventDoc>;
  }
  return {
    $or: [
      { source: "coin" as const },
      {
        $and: [
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

let indexesEnsured: Promise<void> | null = null;

async function getSalesCollection(): Promise<Collection<SalesEventDoc>> {
  const db = await getDb();
  const coll = db.collection<SalesEventDoc>(COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = Promise.all([
      coll.createIndex({ createdAt: -1 }),
      coll.createIndex({ jcard: 1, createdAt: -1 }),
    ]).then(() => {});
  }
  await indexesEnsured;
  return coll;
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
  quantity: number;
  /** Resolved UID (jcard or legacy rfid) for display. */
  jcard?: string;
  source?: "coin";
};

function rowCardUid(d: SalesEventDoc): string | undefined {
  const j = typeof d.jcard === "string" ? d.jcard.trim() : "";
  if (j) return j;
  const r = typeof d.rfid === "string" ? d.rfid.trim() : "";
  return r || undefined;
}

export async function recordSale(
  quantity: number,
  jcard?: string | null,
): Promise<{ id: string; createdAt: Date; source: "jcard" | "coin" }> {
  const coll = await getSalesCollection();
  const createdAt = new Date();
  const trimmed = jcard?.trim();
  const result = await coll.insertOne(
    (trimmed
      ? { createdAt, quantity, jcard: trimmed }
      : { createdAt, quantity, source: "coin" as const }) as OptionalUnlessRequiredId<SalesEventDoc>,
  );
  return {
    id: result.insertedId.toHexString(),
    createdAt,
    source: trimmed ? "jcard" : "coin",
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
    .project({ quantity: 1, createdAt: 1, jcard: 1, rfid: 1, source: 1 })
    .toArray();

  const dayKeys = getLast7LocalDayKeys();
  const coinByDay = new Map<string, number>();
  const jcardByDay = new Map<string, number>();

  for (const row of docs) {
    const key = localDateKey(row.createdAt);
    const q = row.quantity;
    if (isJcardSale(row)) {
      jcardByDay.set(key, (jcardByDay.get(key) ?? 0) + q);
    } else {
      coinByDay.set(key, (coinByDay.get(key) ?? 0) + q);
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

export async function getDashboardStats(sourceFilter: SalesSourceFilter = "all") {
  const coll = await getSalesCollection();

  const { start: todayStart, end: todayEnd } = localDayBounds();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const baseToday: Filter<SalesEventDoc> = { createdAt: { $gte: todayStart, $lt: todayEnd } };
  const baseWeek: Filter<SalesEventDoc> = { createdAt: { $gte: weekAgo } };

  const matchTotal = matchWithSource(sourceFilter, {} as Filter<SalesEventDoc>);
  const totalPipeline =
    Object.keys(matchTotal as object).length > 0
      ? [{ $match: matchTotal }, { $group: { _id: null as null, n: { $sum: "$quantity" } } }]
      : [{ $group: { _id: null as null, n: { $sum: "$quantity" } } }];

  const [totalAgg, todayAgg, weekAgg] = await Promise.all([
    coll.aggregate<{ n: number }>(totalPipeline as never).toArray(),
    coll
      .aggregate<{ n: number }>([
        { $match: matchWithSource(sourceFilter, baseToday) },
        { $group: { _id: null, n: { $sum: "$quantity" } } },
      ])
      .toArray(),
    coll
      .aggregate<{ n: number }>([
        { $match: matchWithSource(sourceFilter, baseWeek) },
        { $group: { _id: null, n: { $sum: "$quantity" } } },
      ])
      .toArray(),
  ]);

  const totalAllTime = totalAgg[0]?.n ?? 0;
  const totalToday = todayAgg[0]?.n ?? 0;
  const totalLast7Days = weekAgg[0]?.n ?? 0;

  const recentDocs = await coll
    .find(matchWithSource(sourceFilter, {}))
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();

  const recent: SalesEventRow[] = recentDocs.map((d) => ({
    id: d._id.toHexString(),
    createdAt: d.createdAt,
    quantity: d.quantity,
    jcard: rowCardUid(d),
    source: d.source,
  }));

  return {
    totalAllTime,
    totalToday,
    totalLast7Days,
    recent,
  };
}
