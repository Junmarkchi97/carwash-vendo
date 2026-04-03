import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI environment variable');
  }

  if (!globalForMongo._mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverApi: { version: "1", strict: true, deprecationErrors: true },
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 20_000,
      retryReads: true,
      retryWrites: true,
    });
    globalForMongo._mongoClientPromise = client.connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  const name = process.env.MONGODB_DB || "carwash_vendo";
  return client.db(name);
}

/** Named database on the same cluster (e.g. `carwash` for `customers`). */
export async function getDatabase(dbName: string): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(dbName);
}
