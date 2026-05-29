import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lumina_pro_ai";
const dbName = process.env.MONGODB_DB || "lumina_pro_ai";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });

try {
  const started = Date.now();
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const probe = db.collection("_lumina_health_probe");
  const result = await probe.insertOne({ createdAt: new Date(), source: "npm run db:test" });
  await probe.deleteOne({ _id: result.insertedId });
  console.log(`MongoDB OK: ${dbName} (${Date.now() - started}ms)`);
} catch (error) {
  console.error("MongoDB test failed:");
  console.error(error instanceof Error ? error.message : error);
  console.error("Start MongoDB locally or update MONGODB_URI in .env. The app still runs in memory fallback mode.");
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
