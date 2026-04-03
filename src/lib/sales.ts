import type { Collection, ObjectId, OptionalUnlessRequiredId } from "mongodb";
import { getDb } from "./db";

const COLLECTION = "sales_events";

type SalesEventDoc = {
  _id: ObjectId;
  createdAt: Date;
  quantity: number;
};

let indexesPromise: Promise<string> | null = null;

async function getSalesCollection(): Promise<Collection<SalesEventDoc>> {
  const db = await getDb();
  const coll = db.collection<SalesEventDoc>(COLLECTION);
  if (!indexesPromise) {
    indexesPromise = coll.createIndex({ createdAt: -1 });
  }
  await indexesPromise;
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

export type SalesEventRow = {
  id: string;
  createdAt: Date;
  quantity: number;
};

export async function recordSale(quantity: number): Promise<{ id: string }> {
  const coll = await getSalesCollection();
  const result = await coll.insertOne({
    createdAt: new Date(),
    quantity,
  } as OptionalUnlessRequiredId<SalesEventDoc>);
  return { id: result.insertedId.toHexString() };
}

export async function getDashboardStats() {
  const coll = await getSalesCollection();

  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const { start: todayStart, end: todayEnd } = localDayBounds();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [totalAgg, todayAgg, weekAgg, chartDocs] = await Promise.all([
    coll
      .aggregate<{ n: number }>([{ $group: { _id: null, n: { $sum: "$quantity" } } }])
      .toArray(),
    coll
      .aggregate<{ n: number }>([
        { $match: { createdAt: { $gte: todayStart, $lt: todayEnd } } },
        { $group: { _id: null, n: { $sum: "$quantity" } } },
      ])
      .toArray(),
    coll
      .aggregate<{ n: number }>([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, n: { $sum: "$quantity" } } },
      ])
      .toArray(),
    coll
      .find({ createdAt: { $gte: weekStart } })
      .project({ quantity: 1, createdAt: 1 })
      .toArray(),
  ]);

  const totalAllTime = totalAgg[0]?.n ?? 0;
  const totalToday = todayAgg[0]?.n ?? 0;
  const totalLast7Days = weekAgg[0]?.n ?? 0;

  const byDay = new Map<string, number>();
  for (const row of chartDocs) {
    const key = localDateKey(row.createdAt);
    byDay.set(key, (byDay.get(key) ?? 0) + row.quantity);
  }

  const dailyLast7 = [...byDay.entries()].map(([day, total]) => ({ day, total }));
  dailyLast7.sort((a, b) => a.day.localeCompare(b.day));

  const recentDocs = await coll
    .find({})
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();

  const recent: SalesEventRow[] = recentDocs.map((d) => ({
    id: d._id.toHexString(),
    createdAt: d.createdAt,
    quantity: d.quantity,
  }));

  return {
    totalAllTime,
    totalToday,
    totalLast7Days,
    dailyLast7,
    recent,
  };
}
