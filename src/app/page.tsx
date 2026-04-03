import { SalesComparisonChart } from "@/components/SalesComparisonChart";
import { LiveRefresh } from "@/components/LiveRefresh";
import { formatPeso } from "@/lib/currency";
import { getJcardTapChargePesos } from "@/lib/settings";
import {
  coinSlotPricePhp,
  getCoinJcardDailyLast7,
  getDashboardStats,
  parseSalesSourceFilter,
  type SalesSourceFilter,
} from "@/lib/sales";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ source?: string }>;
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
      allTime: "All-time (gross PHP)",
      today: "Today (gross PHP)",
      week: "Last 7 days (gross PHP)",
      recent: "Recent (gross PHP)",
    };
  }
  if (f === "coin") {
    return {
      allTime: "All-time — coin (PHP)",
      today: "Today — coin (PHP)",
      week: "Last 7 days — coin (PHP)",
      recent: "Recent — coin (PHP)",
    };
  }
  return {
    allTime: "All-time — JCard (PHP)",
    today: "Today — JCard (PHP)",
    week: "Last 7 days — JCard (PHP)",
    recent: "Recent — JCard (PHP)",
  };
}

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sourceFilter = parseSalesSourceFilter(sp.source);
  const coinSlotPhp = coinSlotPricePhp();
  let stats: Awaited<ReturnType<typeof getDashboardStats>> = {
    totalAllTimePhp: 0,
    totalTodayPhp: 0,
    totalLast7DaysPhp: 0,
    recent: [],
  };
  let comparison: Awaited<ReturnType<typeof getCoinJcardDailyLast7>> = [];
  let jcardTapPhp = 4;
  let dataError: string | null = null;

  try {
    const tap = await getJcardTapChargePesos();
    jcardTapPhp = tap.value;
    [stats, comparison] = await Promise.all([
      getDashboardStats(sourceFilter, { coinSlotPhp, jcardTapPhp }),
      getCoinJcardDailyLast7(),
    ]);
  } catch (err) {
    console.error("Dashboard data load failed", err);
    dataError = "Data is temporarily unavailable (database connection failed).";
  }

  const labels = statLabels(sourceFilter);
  /** `getCoinJcardDailyLast7` returns coin vs JCard gross PHP per day (`price` per event). */
  const sumCoin7Php = comparison.reduce((s, r) => s + r.coin, 0);
  const sumJcard7Php = comparison.reduce((s, r) => s + r.jcard, 0);

  return (
    <div className="min-h-full bg-linear-to-b from-sky-950 via-slate-950 to-slate-950 text-slate-100">
      <LiveRefresh intervalMs={5000} />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-base font-semibold uppercase tracking-[0.14em] text-sky-400 sm:text-lg">
              JEYS CARWASH
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Sales dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Amounts are gross revenue in Philippine peso (₱): coin slot ×{" "}
              {formatPeso(coinSlotPhp)} per unit, JCard ×{" "}
              {formatPeso(jcardTapPhp)} per tap (from{" "}
              <Link
                href="/settings"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                Settings
              </Link>
              ). Each event stores <code className="text-sky-200/80">price</code> in MongoDB; older rows
              may still be estimated from legacy fields.
            </p>
          </div>
        </header>

        <section className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            View
          </p>
          <nav className="flex flex-wrap gap-2">
            <Link
              href="/"
              className={filterClass(sourceFilter === "all")}
              scroll={false}
            >
              All
            </Link>
            <Link
              href="/?source=coin"
              className={filterClass(sourceFilter === "coin")}
              scroll={false}
            >
              Coin slot
            </Link>
            <Link
              href="/?source=jcard"
              className={filterClass(sourceFilter === "jcard")}
              scroll={false}
            >
              JCard
            </Link>
          </nav>
        </section>

        {dataError ? (
          <p className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {dataError}{" "}
            <span className="text-amber-200/80">
              Open the{" "}
              <Link
                href="/health"
                className="font-medium text-amber-200 underline-offset-2 hover:underline"
              >
                Health
              </Link>{" "}
              page or{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-amber-100">
                GET /api/health
              </code>
              .
            </span>
          </p>
        ) : null}

        <p className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <span className="text-amber-400/90">Coin (last 7 days):</span>{" "}
          <span className="font-semibold tabular-nums text-white">
            {formatPeso(sumCoin7Php)}
          </span>
          <span className="mx-3 text-slate-600">·</span>
          <span className="text-sky-300/90">JCard (last 7 days):</span>{" "}
          <span className="font-semibold tabular-nums text-white">
            {formatPeso(sumJcard7Php)}
          </span>
        </p>

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

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Coin vs JCard — last 7 days (₱)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Gross PHP per day from <code className="text-slate-400">price</code> per event. Not affected
              by the filter above.
            </p>
          </div>
          {comparison.every((r) => r.coin === 0 && r.jcard === 0) ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No sales in the last 7 days yet.
            </p>
          ) : (
            <SalesComparisonChart data={comparison} />
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {labels.recent}
          </h2>
          {stats.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No sales in this view. Try another filter or post from your
              devices.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {stats.recent.map((row) => {
                const isJcard = row.source === "jcard";
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex h-5 shrink-0 items-center justify-center rounded px-2 text-[10px] font-semibold uppercase leading-0 tracking-wide ${
                            isJcard
                              ? "bg-sky-500/20 text-sky-200"
                              : "bg-amber-500/20 text-amber-200"
                          }`}
                        >
                          {isJcard ? "JCard" : "Coin"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {isJcard ? "RFID tap" : `Coin slot (${formatPeso(coinSlotPhp)} / unit)`}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        {row.createdAt.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span className="tabular-nums text-slate-200">+{formatPeso(row.revenuePhp)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
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
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">
        {formatPeso(valuePhp)}
      </p>
    </div>
  );
}
