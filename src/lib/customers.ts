import type { Collection, Document } from "mongodb";
import { getDatabase } from "./db";

const DEFAULT_CUSTOMERS_DB = "carwash";
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

export function tapChargePesos(): number {
  const raw =
    process.env.JCARD_TAP_CHARGE_PESOS ?? process.env.RFID_TAP_CHARGE_PESOS;
  const n = raw !== undefined ? Number(raw) : 4;
  return Number.isFinite(n) && n > 0 ? n : 4;
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
 * Looks up a customer by JCard id and atomically deducts the tap charge (default ₱4)
 * if balance is sufficient. Uses `carwash` DB + `customers` collection by default.
 */
export async function tapJcardAndCharge(jcardRaw: string): Promise<TapOutcome> {
  const jcard = jcardRaw.trim();
  if (!jcard) {
    return { ok: false, error: "not_found" };
  }

  const charge = tapChargePesos();
  const jcardKey = jcardField();
  const balanceKey = balanceField();

  const coll = await getCustomersCollection();

  const filter: Document = {
    [jcardKey]: jcard,
    [balanceKey]: { $gte: charge },
  };

  const result = await coll.findOneAndUpdate(
    filter,
    { $inc: { [balanceKey]: -charge } },
    { returnDocument: "after" },
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

  const exists = await coll.findOne({ [jcardKey]: jcard });
  if (!exists) {
    return { ok: false, error: "not_found" };
  }

  return {
    ok: false,
    error: "insufficient",
    balance: readBalance(exists, balanceKey),
  };
}
