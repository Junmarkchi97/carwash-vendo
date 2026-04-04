"use client";

import { formatPeso } from "@/lib/currency";
import { useEffect, useRef, useState } from "react";

export type DashboardCustomerRow = {
  jcard: string;
  name: string | null;
  balancePhp: number;
  joinedAt: string | null;
  lastTapIso: string | null;
};

export function DashboardCustomersList({ customers }: { customers: DashboardCustomerRow[] }) {
  const prevBalanceRef = useRef<Map<string, number>>(new Map());
  const hadCustomersRef = useRef(false);
  const didInitRef = useRef(false);
  const [balanceFlashTick, setBalanceFlashTick] = useState<Record<string, number>>({});
  const [listFlashKey, setListFlashKey] = useState(0);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      for (const c of customers) prevBalanceRef.current.set(c.jcard, c.balancePhp);
      hadCustomersRef.current = customers.length > 0;
      return;
    }

    if (customers.length > 0 && !hadCustomersRef.current) {
      setListFlashKey((k) => k + 1);
    }
    hadCustomersRef.current = customers.length > 0;

    const next = new Map<string, number>();
    for (const c of customers) {
      next.set(c.jcard, c.balancePhp);
    }

    setBalanceFlashTick((prevTicks) => {
      let changed = false;
      const out = { ...prevTicks };
      for (const c of customers) {
        const oldBal = prevBalanceRef.current.get(c.jcard);
        if (oldBal !== undefined && oldBal !== c.balancePhp) {
          out[c.jcard] = (out[c.jcard] ?? 0) + 1;
          changed = true;
        }
      }
      return changed ? out : prevTicks;
    });

    prevBalanceRef.current = next;
  }, [customers]);

  if (customers.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">No customers found.</p>;
  }

  return (
    <div className="relative mt-4">
      {listFlashKey > 0 ? (
        <div
          key={listFlashKey}
          className="pointer-events-none absolute inset-0 z-0 rounded-xl animate-dashboard-recent-section-flash"
          aria-hidden
        />
      ) : null}
      <ul className="relative z-10 divide-y divide-white/10">
        {customers.map((c) => {
          const joinedAt = c.joinedAt ? new Date(c.joinedAt) : null;
          const tick = balanceFlashTick[c.jcard] ?? 0;
          return (
            <li
              key={c.jcard}
              className="flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="font-medium text-slate-200">
                    {c.name ?? <span className="text-slate-500">(no name)</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-sky-300/90">{c.jcard}</span>
                </div>
                <div className="flex flex-col gap-0.5 text-xs text-slate-500">
                  {joinedAt ? (
                    <span>Joined {joinedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                  ) : null}
                  {c.lastTapIso ? (
                    <span>
                      Last tap{" "}
                      {new Date(c.lastTapIso).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  ) : (
                    <span className="text-slate-600">No JCard taps recorded</span>
                  )}
                </div>
              </div>
              <span
                key={`bal-${c.jcard}-${tick}`}
                className={`shrink-0 tabular-nums text-emerald-200/90 ${
                  tick > 0 ? "animate-dashboard-balance-flash" : ""
                }`}
              >
                {formatPeso(c.balancePhp)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
