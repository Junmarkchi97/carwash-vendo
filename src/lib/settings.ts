import type { Collection, Document, WithId } from "mongodb";
import { getDb } from "./db";

const COLLECTION = "settings";
const DOC_ID = "pricing";

/** `jcardTapChargePesos` is the tap deduction amount in PHP (Philippine peso). */
type PricingSettingsDoc = WithId<
  Document & {
    _id: typeof DOC_ID;
    jcardTapChargePesos?: number;
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
  return Number.isFinite(n) && n > 0 ? n : 4;
}

let cached:
  | { value: number; updatedAt?: Date; fetchedAtMs: number }
  | null = null;

const CACHE_TTL_MS = 5_000;

export async function getJcardTapChargePesos(): Promise<{
  value: number;
  source: "db" | "env";
  updatedAt?: Date;
}> {
  const now = Date.now();
  if (cached && now - cached.fetchedAtMs < CACHE_TTL_MS) {
    return { value: cached.value, source: "db", updatedAt: cached.updatedAt };
  }

  try {
    const coll = await getSettingsCollection();
    const doc = await coll.findOne({ _id: DOC_ID });
    const v = doc?.jcardTapChargePesos;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      cached = { value: v, updatedAt: doc?.updatedAt, fetchedAtMs: now };
      return { value: v, source: "db", updatedAt: doc?.updatedAt };
    }
  } catch {
    // fall through to env default
  }

  return { value: envDefaultTapCharge(), source: "env" };
}

export async function setJcardTapChargePesos(value: number): Promise<{
  value: number;
  updatedAt: Date;
}> {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("jcardTapChargePesos must be a positive integer (PHP)");
  }

  const coll = await getSettingsCollection();
  const updatedAt = new Date();
  await coll.updateOne(
    { _id: DOC_ID },
    { $set: { jcardTapChargePesos: n, updatedAt } },
    { upsert: true },
  );

  cached = { value: n, updatedAt, fetchedAtMs: Date.now() };
  return { value: n, updatedAt };
}

