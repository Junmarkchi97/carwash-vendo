"use client";

import { formatPhp } from "@/lib/currency";
import { useState } from "react";
import { saveJcardPricingAction } from "./actions";

function formatDurationLabel(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s} sec`;
  if (s <= 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

type SettingsFormProps = {
  initialJcardTapChargePesos: number;
  initialJcardTapDurationSeconds: number;
  initialCurrency: string;
  initialSource: "db" | "env";
  initialUpdatedAt: string | null;
};

export function SettingsForm({
  initialJcardTapChargePesos,
  initialJcardTapDurationSeconds,
  initialCurrency,
  initialSource,
  initialUpdatedAt,
}: SettingsFormProps) {
  const [loading, setLoading] = useState(false);
  const [charge, setCharge] = useState(String(initialJcardTapChargePesos));
  const [durMinutes, setDurMinutes] = useState(
    String(Math.floor(initialJcardTapDurationSeconds / 60)),
  );
  const [durSeconds, setDurSeconds] = useState(String(initialJcardTapDurationSeconds % 60));
  const [status, setStatus] = useState<string>("");
  const [currencyHint, setCurrencyHint] = useState<string>(initialCurrency);

  async function save() {
    const nCharge = Math.floor(Number(charge));
    const m = Math.floor(Number(durMinutes));
    const sec = Math.floor(Number(durSeconds));
    if (!Number.isFinite(nCharge) || nCharge <= 0) {
      setStatus("Enter a positive number for amount per tap.");
      return;
    }
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(sec) || sec < 0 || sec > 59) {
      setStatus("Minutes must be ≥ 0; seconds must be 0–59.");
      return;
    }
    const totalSeconds = m * 60 + sec;
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      setStatus("Total wash duration must be at least 1 second.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const result = await saveJcardPricingAction({
        jcardTapChargePesos: nCharge,
        jcardTapDurationSeconds: totalSeconds,
      });
      if (!result.ok) {
        const hint =
          result.error === "Unauthorized"
            ? "Unauthorized — if CARWASH_API_KEY is set, add CARWASH_ALLOW_SETTINGS_WITHOUT_KEY=true on the server to allow saving from this page (or use the admin API with X-API-Key)."
            : result.error;
        setStatus(`Save failed: ${hint}`);
        return;
      }
      setCurrencyHint(result.currency);
      setCharge(String(result.jcardTapChargePesos));
      const d = result.jcardTapDurationSeconds;
      setDurMinutes(String(Math.floor(d / 60)));
      setDurSeconds(String(d % 60));
      setStatus(
        `Saved. Charge ${formatPhp(result.jcardTapChargePesos)} per tap; ${formatDurationLabel(result.jcardTapDurationSeconds)} per tap (${result.jcardTapDurationSeconds} s total).`,
      );
    } finally {
      setLoading(false);
    }
  }

  const loadedHint =
    initialSource === "db" && initialUpdatedAt
      ? `Loaded from database (updated ${new Date(initialUpdatedAt).toLocaleString()}).`
      : initialSource === "db"
        ? "Loaded from database."
        : "Using env defaults until you save; saving writes pricing to MongoDB (`settings` collection).";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">JCard tap pricing</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            Currency: {currencyHint}
          </span>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs text-slate-500">{loadedHint}</p>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Amount per successful tap</label>
            <input
              inputMode="numeric"
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
            />
            <p className="text-xs text-slate-500">
              Deducted from each customer&apos;s <code className="text-sky-200/80">balance</code> in MongoDB (
              <code className="text-sky-200/80">carwash_vendo.customers</code>). Applies on the next tap after save.
            </p>
          </div>
          <div className="space-y-1 pt-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Wash time per successful tap</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                inputMode="numeric"
                value={durMinutes}
                onChange={(e) => setDurMinutes(e.target.value)}
                className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
                aria-label="Minutes"
              />
              <span className="text-sm text-slate-400">min</span>
              <input
                inputMode="numeric"
                value={durSeconds}
                onChange={(e) => setDurSeconds(e.target.value)}
                className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
                aria-label="Seconds"
              />
              <span className="text-sm text-slate-400">sec</span>
            </div>
            <p className="text-xs text-slate-500">
              Total time is stored as seconds. <code className="text-sky-200/80">POST /api/jcard/tap</code> returns{" "}
              <code className="text-sky-200/80">jcardTapDurationSeconds</code> and{" "}
              <code className="text-sky-200/80">jcardTapDuration</code> {"{ minutes, seconds }"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={loading}
              className="rounded-xl bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 ring-1 ring-inset ring-sky-400/40 hover:bg-sky-500/25 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {status ? (
        <p className="rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-xs text-slate-300">{status}</p>
      ) : null}
    </div>
  );
}
