import type { Metadata } from "next";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Health",
  description: "MongoDB and API readiness",
};

type Health = {
  ok: boolean;
  time: string;
  service: string;
  checks?: {
    mongodb?: { ok: boolean; error?: string };
  };
};

async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) {
    return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  }
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function getHealth(): Promise<Health> {
  const base = await appOrigin();
  const res = await fetch(`${base}/api/health`, { cache: "no-store" });
  const json = (await res.json()) as Health;
  return { ...json, ok: Boolean(json.ok && res.ok) };
}

export default async function HealthPage() {
  const health = await getHealth();
  const mongoOk = health.checks?.mongodb?.ok ?? false;
  const mongoErr = health.checks?.mongodb?.error;

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-linear-to-b from-sky-950 via-slate-950 to-slate-950 px-4 py-10 pb-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-sky-400/90">Status</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Health</h1>
        <p className="mt-2 text-sm text-slate-400">
          JSON: <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-sky-200">GET /api/health</code>
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Overall</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-200">{health.service}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                health.ok ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
              }`}
            >
              {health.ok ? "OK" : "DEGRADED"}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Time</dt>
              <dd className="font-mono text-slate-200">{health.time}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">MongoDB</dt>
              <dd className="font-mono text-slate-200">
                {mongoOk ? "ok" : mongoErr ? `error: ${mongoErr}` : "unknown"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}

