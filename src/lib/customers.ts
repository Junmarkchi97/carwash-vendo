import type { Collection, Document } from "mongodb";
import { ObjectId } from "mongodb";
import { getDatabase } from "./db";
import { getJcardTapChargePesos } from "./settings";

const DEFAULT_CUSTOMERS_DB = "carwash_vendo";
const DEFAULT_COLLECTION = "customers";

function customersDbName(): string {
  return process.env.MONGODB_CUSTOMERS_DB || DEFAULT_CUSTOMERS_DB;
}

function customersCollectionName(): string {
  return process.env.MONGODB_CUSTOMERS_COLLECTION || DEFAULT_COLLECTION;
}

function jcardField(): string {
  return (
    process.env.CUSTOMERS_JCARD_FIELD ||
    process.env.CUSTOMERS_RFID_FIELD ||
    "jcard"
  );
}

function balanceField(): string {
  return process.env.CUSTOMERS_BALANCE_FIELD || "balance";
}

function nameField(): string {
  return process.env.CUSTOMERS_NAME_FIELD || "name";
}

/** Single field name, or unset to try common keys then `_id` timestamp. */
function joinedAtField(): string | undefined {
  const v =
    process.env.CUSTOMERS_JOINED_AT_FIELD?.trim() ||
    process.env.CUSTOMERS_CREATED_AT_FIELD?.trim();
  return v || undefined;
}

function coerceToDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Prefer explicit `joinedAt` / `createdAt` fields, env override, then ObjectId creation time.
 */
export function readCustomerJoinedAt(doc: Document): Date | null {
  const explicit = joinedAtField();
  const keys = explicit
    ? [explicit]
    : (["joinedAt", "createdAt", "dateJoined"] as const);
  for (const key of keys) {
    const d = coerceToDate(doc[key]);
    if (d) return d;
  }
  const id = doc._id;
  if (id instanceof ObjectId) {
    return id.getTimestamp();
  }
  return null;
}

function readName(doc: Document, nameKey: string): string | null {
  const v = doc[nameKey];
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

let indexesEnsured: Promise<string> | null = null;

async function getCustomersCollection(): Promise<Collection<Document>> {
  const db = await getDatabase(customersDbName());
  const coll = db.collection(customersCollectionName());
  const key = jcardField();
  if (!indexesEnsured) {
    indexesEnsured = coll.createIndex({ [key]: 1 });
  }
  await indexesEnsured;
  return coll;
}

export type TapOutcome =
  | {
      ok: true;
      jcard: string;
      charged: number;
      balanceBefore: number;
      balanceAfter: number;
    }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "insufficient"; balance: number };

function readBalance(doc: Document, balanceKey: string): number {
  const v = doc[balanceKey];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Looks up a customer by JCard id and atomically deducts the tap charge in PHP (default 4)
 * if balance is sufficient. Uses `carwash_vendo` DB + `customers` collection by default.
 */
export async function tapJcardAndCharge(jcardRaw: string): Promise<TapOutcome> {
  const jcard = jcardRaw.trim();
  if (!jcard) {
    return { ok: false, error: "not_found" };
  }

  const { value: charge } = await getJcardTapChargePesos();
  const jcardKey = jcardField();
  const balanceKey = balanceField();

  const coll = await getCustomersCollection();

  const filter: Document = {
    [jcardKey]: jcard,
    [balanceKey]: { $gte: charge },
  };
  const balanceOnlyProjection: Document = {
    [balanceKey]: 1,
    _id: 0,
  };

  const result = await coll.findOneAndUpdate(
    filter,
    { $inc: { [balanceKey]: -charge } },
    { returnDocument: "after", projection: balanceOnlyProjection },
  );

  if (result) {
    const balanceAfter = readBalance(result, balanceKey);
    const balanceBefore = balanceAfter + charge;
    return {
      ok: true,
      jcard,
      charged: charge,
      balanceBefore,
      balanceAfter,
    };
  }

  const exists = await coll.findOne(
    { [jcardKey]: jcard },
    { projection: balanceOnlyProjection },
  );
  if (!exists) {
    return { ok: false, error: "not_found" };
  }

  return {
    ok: false,
    error: "insufficient",
    balance: readBalance(exists, balanceKey),
  };
}

export type CustomerListItem = {
  jcard: string;
  name: string | null;
  /** Stored balance in PHP (field from {@link balanceField}). */
  balancePhp: number;
  /** When the customer record was created / joined, best effort. */
  joinedAt: Date | null;
};

function joinedAtProjection(): Document {
  const proj: Document = {
    joinedAt: 1,
    createdAt: 1,
    dateJoined: 1,
    _id: 1,
  };
  const custom = joinedAtField();
  if (custom && proj[custom] === undefined) {
    proj[custom] = 1;
  }
  return proj;
}

/** All customers with optional display name and balance (for dashboard). */
export async function listCustomers(): Promise<CustomerListItem[]> {
  const coll = await getCustomersCollection();
  const jcardKey = jcardField();
  const nameKey = nameField();
  const balKey = balanceField();
  const docs = await coll
    .find({})
    .project({
      [jcardKey]: 1,
      [nameKey]: 1,
      [balKey]: 1,
      ...joinedAtProjection(),
    })
    .toArray();
  const out: CustomerListItem[] = [];
  for (const doc of docs) {
    const raw = doc[jcardKey];
    const jc = typeof raw === "string" ? raw.trim() : "";
    if (!jc) continue;
    out.push({
      jcard: jc,
      name: readName(doc, nameKey),
      balancePhp: readBalance(doc, balKey),
      joinedAt: readCustomerJoinedAt(doc),
    });
  }
  out.sort((a, b) => {
    const an = a.name ?? "";
    const bn = b.name ?? "";
    if (an && bn) return an.localeCompare(bn);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.jcard.localeCompare(b.jcard);
  });
  return out;
}

export type CustomerDetailsByJcard = {
  name: string | null;
  balancePhp: number;
  joinedAt: Date | null;
};

/** Batch lookup of name + balance + joined date by JCard UID (for sales rows). */
export async function getCustomerDetailsByJcards(
  jcards: string[],
): Promise<Map<string, CustomerDetailsByJcard>> {
  const uniq = [...new Set(jcards.map((j) => j.trim()).filter(Boolean))];
  const map = new Map<string, CustomerDetailsByJcard>();
  if (uniq.length === 0) return map;

  const coll = await getCustomersCollection();
  const jcardKey = jcardField();
  const nameKey = nameField();
  const balKey = balanceField();
  const docs = await coll
    .find({ [jcardKey]: { $in: uniq } })
    .project({
      [jcardKey]: 1,
      [nameKey]: 1,
      [balKey]: 1,
      ...joinedAtProjection(),
    })
    .toArray();

  for (const doc of docs) {
    const raw = doc[jcardKey];
    const jc = typeof raw === "string" ? raw.trim() : "";
    if (!jc) continue;
    map.set(jc, {
      name: readName(doc, nameKey),
      balancePhp: readBalance(doc, balKey),
      joinedAt: readCustomerJoinedAt(doc),
    });
  }
  return map;
}
