import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthResponse = {
  ok: boolean;
  time: string;
  service: string;
  checks: {
    mongodb: { ok: boolean; error?: string };
  };
  meta?: Record<string, string | undefined>;
};

async function checkMongo(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function GET() {
  const mongodb = await checkMongo();

  const res: HealthResponse = {
    ok: mongodb.ok,
    time: new Date().toISOString(),
    service: "carwash-vendo",
    checks: { mongodb },
    meta: {
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA,
    },
  };

  return NextResponse.json(res, { status: res.ok ? 200 : 503 });
}

