import type { Collection, Document } from "mongodb";
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
