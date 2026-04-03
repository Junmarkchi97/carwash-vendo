"use client";

import { formatPhp } from "@/lib/currency";
import Link from "next/link";
import { useEffect, useState } from "react";
import { saveJcardTapChargePesosAction } from "./actions";

function getSavedKey(): string {
  try {
    return localStorage.getItem("carwash_api_key") || "";
  } catch {
    return "";
  }
}

function saveKey(key: string) {
  try {
    localStorage.setItem("carwash_api_key", key);
  } catch {
    // ignore
  }
}

type SettingsFormProps = {
  initialJcardTapChargePesos: number;
  initialCurrency: string;
  initialSource: "db" | "env";
  initialUpdatedAt: string | null;
};

export function SettingsForm({
  initialJcardTapChargePesos,
  initialCurrency,
  initialSource,
  initialUpdatedAt,
}: SettingsFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [charge, setCharge] = useState(String(initialJcardTapChargePesos));
  const [status, setStatus] = useState<string>("");
  const [currencyHint, setCurrencyHint] = useState<string>(initialCurrency);

  useEffect(() => {
    const k = getSavedKey();
    if (k) setApiKey(k);
  }, []);

  async function save() {
    const n = Math.floor(Number(charge));
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a positive number.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const key = apiKey.trim() || getSavedKey();
      const result = await saveJcardTapChargePesosAction(key || undefined, n);
      if (!result.ok) {
        const hint =
          result.error === "Unauthorized"
            ? "Unauthorized — enter the Admin API key above so it matches CARWASH_API_KEY on the server (or set CARWASH_ALLOW_NO_KEY=true when no key is configured)."
            : result.error;
        setStatus(`Save failed: ${hint}`);
        return;
      }
      setCurrencyHint(result.currency);
      setCharge(String(result.jcardTapChargePesos));
      setStatus(`Saved. New tap charge: ${formatPhp(result.jcardTapChargePesos)}.`);
    } finally {
      setLoading(false);
    }
  }

  const loadedHint =
    initialSource === "db" && initialUpdatedAt
      ? `Loaded from database (updated ${new Date(initialUpdatedAt).toLocaleString()}).`
      : initialSource === "db"
        ? "Loaded from database."
        : "Using env default (no saved row in settings yet); saving will write to MongoDB.";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Access</h2>
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Admin API key</label>
          <input
            value={apiKey}
            onChange={(e) => {
              const v = e.target.value;
              setApiKey(v);
              saveKey(v);
            }}
            placeholder="Same as CARWASH_API_KEY on the server"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
            autoComplete="off"
          />
          <p className="text-xs text-slate-500">
            Stored only in this browser. Devices use the same key in{" "}
            <code className="text-sky-200/80">Authorization</code> or{" "}
            <code className="text-sky-200/80">X-API-Key</code> for{" "}
            <Link href="/health" className="text-sky-300 underline-offset-2 hover:underline">
              APIs
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">JCard tap price</h2>
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
