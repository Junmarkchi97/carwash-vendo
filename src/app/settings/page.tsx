import type { Metadata } from "next";
import Link from "next/link";
import { SettingsForm } from "./ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description: "JCard tap price (PHP) and admin API access",
};

export default function SettingsPage() {
  return (
    <main className="min-h-full bg-linear-to-b from-sky-950 via-slate-950 to-slate-950 px-4 py-10 pb-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-sky-400/90">Configuration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Prices are in <span className="text-slate-200">PHP</span>. Customer balances live in MongoDB; this page only updates how much each JCard tap charges.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20">
          <SettingsForm />
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Endpoints:{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-sky-200/90">POST /api/jcard/tap</code> ·{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-sky-200/90">POST /api/sales</code> ·{" "}
          <Link href="/health" className="text-sky-300 underline-offset-2 hover:underline">
            system health
          </Link>
        </p>
      </div>
    </main>
  );
}
