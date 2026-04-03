import type { Collection, Document, WithId } from "mongodb";
import { getDb } from "./db";

const COLLECTION = "settings";
const DOC_ID = "pricing";

/**
 * `jcardTapChargePesos` = PHP per tap.
 * `jcardTapDurationSeconds` = wash/run time per tap (total seconds). Legacy: `jcardTapMinutesPerTap` (whole minutes only).
 */
type PricingSettingsDoc = WithId<
  Document & {
    _id: typeof DOC_ID;
    jcardTapChargePesos?: number;
    /** Total seconds per tap (preferred). */
    jcardTapDurationSeconds?: number;
    /** @deprecated Whole minutes only; used if duration seconds not set. */
    jcardTapMinutesPerTap?: number;
    updatedAt?: Date;
  }
>;

async function getSettingsCollection(): Promise<Collection<PricingSettingsDoc>> {
  const db = await getDb();
  return db.collection<PricingSettingsDoc>(COLLECTION);
}

function envDefaultTapCharge(): number {
  const raw =
    process.env.JCARD_TAP_CHARGE_PESOS ?? process.env.RFID_TAP_CHARGE_PESOS;
  const n = raw !== undefined ? Number(raw) : 4;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

/** Default duration: `JCARD_TAP_DURATION_SECONDS`, else `JCARD_TAP_MINUTES`×60, else 300 (5 min). */
function envDefaultDurationSeconds(): number {
  const rawSec = process.env.JCARD_TAP_DURATION_SECONDS;
  if (rawSec !== undefined && rawSec !== "") {
    const n = Number(rawSec);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const rawMin = process.env.JCARD_TAP_MINUTES ?? process.env.JCARD_MINUTES_PER_TAP;
  const m = rawMin !== undefined ? Number(rawMin) : 5;
  if (Number.isFinite(m) && m > 0) return Math.floor(m) * 60;
  return 300;
}

function durationFromDoc(doc: PricingSettingsDoc): {
  seconds: number;
  fromDb: boolean;
} {
  const ds = doc.jcardTapDurationSeconds;
  if (typeof ds === "number" && Number.isFinite(ds) && ds > 0) {
    return { seconds: Math.floor(ds), fromDb: true };
  }
  const legacy = doc.jcardTapMinutesPerTap;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) {
    return { seconds: Math.floor(legacy) * 60, fromDb: true };
  }
  return { seconds: envDefaultDurationSeconds(), fromDb: false };
}

type PricingSnapshot = {
  charge: number;
  durationSeconds: number;
  chargeFromDb: boolean;
  durationFromDb: boolean;
  docUpdatedAt?: Date;
  fetchedAtMs: number;
};

let pricingCache: PricingSnapshot | null = null;

const CACHE_TTL_MS = 5_000;

function invalidatePricingCache(): void {
  pricingCache = null;
}

async function getPricingSnapshot(): Promise<PricingSnapshot> {
  const now = Date.now();
  if (pricingCache && now - pricingCache.fetchedAtMs < CACHE_TTL_MS) {
    return pricingCache;
  }

  let chargeFromDb = false;
  let durationFromDb = false;
  let docUpdatedAt: Date | undefined;
  let charge = envDefaultTapCharge();
  let durationSeconds = envDefaultDurationSeconds();

  try {
    const coll = await getSettingsCollection();
    const doc = await coll.findOne({ _id: DOC_ID });
    if (doc) {
      docUpdatedAt = doc.updatedAt;
      const c = doc.jcardTapChargePesos;
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        chargeFromDb = true;
        charge = Math.floor(c);
      }
      const d = durationFromDoc(doc);
      durationSeconds = d.seconds;
      durationFromDb = d.fromDb;
    }
  } catch {
    // fall through to env defaults
  }

  pricingCache = {
    charge,
    durationSeconds,
    chargeFromDb,
    durationFromDb,
    docUpdatedAt,
    fetchedAtMs: now,
  };
  return pricingCache;
}

/** `jcardTapChargePesos` is the tap deduction amount in PHP (Philippine peso). */
export async function getJcardTapChargePesos(): Promise<{
  value: number;
  source: "db" | "env";
  updatedAt?: Date;
}> {
  const s = await getPricingSnapshot();
  return {
    value: s.charge,
    source: s.chargeFromDb ? "db" : "env",
    updatedAt: s.chargeFromDb ? s.docUpdatedAt : undefined,
  };
}

/** Total wash/run time in seconds per successful JCard tap (`POST /api/jcard/tap`). */
export async function getJcardTapDurationSeconds(): Promise<{
  value: number;
  source: "db" | "env";
  updatedAt?: Date;
}> {
  const s = await getPricingSnapshot();
  return {
    value: s.durationSeconds,
    source: s.durationFromDb ? "db" : "env",
    updatedAt: s.durationFromDb ? s.docUpdatedAt : undefined,
  };
}

export type UpdateJcardPricingInput = {
  jcardTapChargePesos?: number;
  jcardTapDurationSeconds?: number;
};

export async function updateJcardPricingSettings(
  updates: UpdateJcardPricingInput,
): Promise<{
  jcardTapChargePesos: number;
  jcardTapDurationSeconds: number;
  updatedAt: Date;
}> {
  const { jcardTapChargePesos: chargeIn, jcardTapDurationSeconds: durIn } = updates;
  if (chargeIn === undefined && durIn === undefined) {
    throw new Error("No pricing fields to update");
  }

  if (chargeIn !== undefined) {
    const n = Math.floor(Number(chargeIn));
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("jcardTapChargePesos must be a positive integer (PHP)");
    }
  }
  if (durIn !== undefined) {
    const n = Math.floor(Number(durIn));
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("jcardTapDurationSeconds must be a positive integer");
    }
  }

  const coll = await getSettingsCollection();
  const updatedAt = new Date();
  const $set: Record<string, unknown> = { updatedAt };
  if (chargeIn !== undefined) {
    $set.jcardTapChargePesos = Math.floor(Number(chargeIn));
  }
  if (durIn !== undefined) {
    $set.jcardTapDurationSeconds = Math.floor(Number(durIn));
  }

  await coll.updateOne({ _id: DOC_ID }, { $set }, { upsert: true });
  invalidatePricingCache();

  const snap = await getPricingSnapshot();
  return {
    jcardTapChargePesos: snap.charge,
    jcardTapDurationSeconds: snap.durationSeconds,
    updatedAt,
  };
}

export async function setJcardTapChargePesos(value: number): Promise<{
  value: number;
  updatedAt: Date;
}> {
  const r = await updateJcardPricingSettings({ jcardTapChargePesos: value });
  return { value: r.jcardTapChargePesos, updatedAt: r.updatedAt };
}

export async function setJcardTapDurationSeconds(value: number): Promise<{
  value: number;
  updatedAt: Date;
}> {
  const r = await updateJcardPricingSettings({ jcardTapDurationSeconds: value });
  return { value: r.jcardTapDurationSeconds, updatedAt: r.updatedAt };
}
