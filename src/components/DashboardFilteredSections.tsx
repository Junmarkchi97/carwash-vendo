"use client";

import { AnimatedPesoAmount } from "@/components/AnimatedPesoAmount";
import { formatPeso } from "@/lib/currency";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Mirrors {@link parseSalesSourceFilter} in `@/lib/sales` — kept local to avoid bundling DB code on the client. */
export type SalesSourceFilter = "all" | "coin" | "jcard";

function parseSalesSourceFilter(raw: string | null | undefined): SalesSourceFilter {
  if (raw === "coin" || raw === "jcard") return raw;
  if (raw === "rfid") return "jcard";
  return "all";
}

export type DashboardStatsSerialized = {
  totalAllTimePhp: number;
  totalTodayPhp: number;
  totalLast7DaysPhp: number;
  recent: {
    id: string;
    createdAt: string;
    revenuePhp: number;
    source: "coin" | "jcard";
    jcardId: string | null;
    customerName: string | null;
    customerBalancePhp: number | null;
    customerJoinedAt: string | null;
    customerLastJcardUseAt: string | null;
  }[];
};

function filterClass(active: boolean) {
  return [
    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active
      ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
      : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200",
  ].join(" ");
}

function statLabels(f: SalesSourceFilter) {
  if (f === "all") {
    return {
      allTime: "All-time",
      today: "Today",
      week: "Last 7 days",
      recent: "Recent",
    };
  }
  if (f === "coin") {
    return {
      allTime: "All-time — coin",
      today: "Today — coin",
      week: "Last 7 days — coin",
      recent: "Recent — coin",
    };
  }
  return {
    allTime: "All-time — JCard",
    today: "Today — JCard",
    week: "Last 7 days — JCard",
    recent: "Recent — JCard",
  };
}

function StatCard({
  label,
  valuePhp,
  accent,
}: {
  label: string;
  valuePhp: number;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-linear-to-br ${accent} p-5 shadow-inner shadow-black/20`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">
        <AnimatedPesoAmount valuePhp={valuePhp} />
      </p>
    </div>
  );
}

type Props = {
  initialSource: SalesSourceFilter;
  statsByFilter: Record<SalesSourceFilter, DashboardStatsSerialized>;
  coinSlotPhp: number;
  jcardTapPhp: number;
  /** Coin vs JCard last-7-days summary (server-rendered). */
  summarySlot: ReactNode;
  /** Chart + customers sections (server-rendered). */
  chartAndCustomersSlot: ReactNode;
};

export function DashboardFilteredSections({
  initialSource,
  statsByFilter,
  coinSlotPhp,
  jcardTapPhp,
  summarySlot,
  chartAndCustomersSlot,
}: Props) {
  const [source, setSource] = useState<SalesSourceFilter>(initialSource);
  const [recentSectionFlashKey, setRecentSectionFlashKey] = useState(0);
  const [balanceFlashTick, setBalanceFlashTick] = useState<Record<string, number>>({});
  const [topRowFlashId, setTopRowFlashId] = useState<string | null>(null);

  const prevHadRowsBySourceRef = useRef<Partial<Record<SalesSourceFilter, boolean>>>({});
  const prevBalanceByRowIdRef = useRef<Map<string, number | null>>(new Map());
  const prevFirstRowIdRef = useRef<string | undefined>(undefined);
  const didInitRecentRef = useRef(false);

  const applyFilter = useCallback((next: SalesSourceFilter) => {
    setSource(next);
    const path = next === "all" ? "/" : `/?source=${next}`;
    window.history.replaceState(null, "", path);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSource(parseSalesSourceFilter(params.get("source") ?? undefined));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const stats = statsByFilter[source];
  const labels = statLabels(source);

  useEffect(() => {
    const hasRows = stats.recent.length > 0;
    const prev = prevHadRowsBySourceRef.current[source];
    if (prev !== undefined && !prev && hasRows) {
      setRecentSectionFlashKey((k) => k + 1);
    }
    prevHadRowsBySourceRef.current[source] = hasRows;
  }, [stats.recent, source]);

  useEffect(() => {
    if (!didInitRecentRef.current) {
      didInitRecentRef.current = true;
      const m = new Map<string, number | null>();
      for (const row of stats.recent) m.set(row.id, row.customerBalancePhp);
      prevBalanceByRowIdRef.current = m;
      prevFirstRowIdRef.current = stats.recent[0]?.id;
      return;
    }

    const prevBal = prevBalanceByRowIdRef.current;
    const nextBal = new Map<string, number | null>();
    for (const row of stats.recent) {
      nextBal.set(row.id, row.customerBalancePhp);
    }
    setBalanceFlashTick((t) => {
      let changed = false;
      const out = { ...t };
      for (const row of stats.recent) {
        const oldBal = prevBal.get(row.id);
        if (
          row.customerBalancePhp != null &&
          oldBal !== undefined &&
          oldBal !== row.customerBalancePhp
        ) {
          out[row.id] = (out[row.id] ?? 0) + 1;
          changed = true;
        }
      }
      return changed ? out : t;
    });
    prevBalanceByRowIdRef.current = nextBal;

    const firstId = stats.recent[0]?.id;
    const prevFirst = prevFirstRowIdRef.current;
    if (firstId && prevFirst !== undefined && firstId !== prevFirst) {
      setTopRowFlashId(firstId);
      const tid = window.setTimeout(() => setTopRowFlashId(null), 2000);
      prevFirstRowIdRef.current = firstId;
      return () => window.clearTimeout(tid);
    }
    if (firstId) prevFirstRowIdRef.current = firstId;
    else if (stats.recent.length === 0) prevFirstRowIdRef.current = undefined;
  }, [stats.recent]);

  return (
    <>
      <section className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">View</p>
        <nav className="flex flex-wrap gap-2">
          <button type="button" onClick={() => applyFilter("all")} className={filterClass(source === "all")}>
            All
          </button>
          <button type="button" onClick={() => applyFilter("coin")} className={filterClass(source === "coin")}>
            Coin slot
          </button>
          <button type="button" onClick={() => applyFilter("jcard")} className={filterClass(source === "jcard")}>
            JCard
          </button>
        </nav>
      </section>

      {summarySlot}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={labels.allTime}
          valuePhp={stats.totalAllTimePhp}
          accent="from-sky-500/20 to-sky-600/5"
        />
        <StatCard
          label={labels.today}
          valuePhp={stats.totalTodayPhp}
          accent="from-emerald-500/20 to-emerald-600/5"
        />
        <StatCard
          label={labels.week}
          valuePhp={stats.totalLast7DaysPhp}
          accent="from-violet-500/20 to-violet-600/5"
        />
      </section>

      {chartAndCustomersSlot}

      <section className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
        {recentSectionFlashKey > 0 ? (
          <div
            key={recentSectionFlashKey}
            className="pointer-events-none absolute inset-0 z-0 rounded-2xl animate-dashboard-recent-section-flash"
            aria-hidden
          />
        ) : null}
        <div className="relative z-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{labels.recent}</h2>
          {stats.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No sales in this view. Try another filter or post from your devices.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {stats.recent.map((row) => {
                const isJcard = row.source === "jcard";
                const createdAt = new Date(row.createdAt);
                const joinedAt = row.customerJoinedAt ? new Date(row.customerJoinedAt) : null;
                const lastTap = row.customerLastJcardUseAt ? new Date(row.customerLastJcardUseAt) : null;
                const balTick = balanceFlashTick[row.id] ?? 0;
                return (
                  <li
                    key={row.id}
                    className={`flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                      topRowFlashId === row.id ? "animate-dashboard-row-flash rounded-lg -mx-2 px-2" : ""
                    }`}
                  >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-5 shrink-0 items-center justify-center rounded px-2 text-[10px] font-semibold uppercase leading-0 tracking-wide ${
                          isJcard ? "bg-sky-500/20 text-sky-200" : "bg-amber-500/20 text-amber-200"
                        }`}
                      >
                        {isJcard ? "JCard" : "Coin"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {isJcard ? "RFID tap" : `Coin slot (${formatPeso(coinSlotPhp)} / unit)`}
                        {isJcard && row.jcardId ? (
                          <>
                            {" "}
                            <span className="text-slate-500">·</span>{" "}
                            {row.customerName ? (
                              <>
                                <span className="text-slate-200">{row.customerName}</span>
                                <span className="text-slate-500"> · </span>
                              </>
                            ) : null}
                            <span className="font-mono text-sky-300/90">{row.jcardId}</span>
                            {row.customerBalancePhp != null ? (
                              <>
                                <span className="text-slate-500"> · </span>
                                <span
                                  key={`bal-${row.id}-${balTick}`}
                                  className={`text-emerald-300/90 ${
                                    balTick > 0 ? "animate-dashboard-balance-flash" : ""
                                  }`}
                                >
                                  bal {formatPeso(row.customerBalancePhp)}
                                </span>
                              </>
                            ) : null}
                            {joinedAt ? (
                              <>
                                <span className="text-slate-500"> · </span>
                                <span className="text-slate-500">
                                  joined {joinedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
                                </span>
                              </>
                            ) : null}
                            {lastTap ? (
                              <>
                                <span className="text-slate-500"> · </span>
                                <span className="text-slate-500">
                                  last tap {lastTap.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">{createdAt.toLocaleString()}</span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <span className="tabular-nums text-slate-200">+{formatPeso(row.revenuePhp)}</span>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
