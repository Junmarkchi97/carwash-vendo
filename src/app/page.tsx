import { SalesComparisonChart } from "@/components/SalesComparisonChart";
import {
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
      allTime: "All-time (units)",
      today: "Today",
      week: "Last 7 days",
      recent: "Recent submissions",
    };
  }
  if (f === "coin") {
    return {
      allTime: "All-time — coin slot",
      today: "Today — coin",
      week: "Last 7 days — coin",
      recent: "Recent — coin slot",
    };
  }
  return {
    allTime: "All-time — JCard",
    today: "Today — JCard",
    week: "Last 7 days — JCard",
    recent: "Recent — JCard",
  };
}

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sourceFilter = parseSalesSourceFilter(sp.source);
  const [stats, comparison] = await Promise.all([
    getDashboardStats(sourceFilter),
    getCoinJcardDailyLast7(),
  ]);

  const labels = statLabels(sourceFilter);
  const sumCoin7 = comparison.reduce((s, r) => s + r.coin, 0);
  const sumJcard7 = comparison.reduce((s, r) => s + r.jcard, 0);

  return (
    <div className="min-h-full bg-linear-to-b from-sky-950 via-slate-950 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-sky-400/90">
              JEYS CARWASH
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Sales dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Totals and list respect the filter below. The chart compares coin vs JCard.{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-sky-200">
                /api/sales
              </code>
            </p>
          </div>
        </header>

        <section className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">View</p>
          <nav className="flex flex-wrap gap-2">
            <Link href="/" className={filterClass(sourceFilter === "all")} scroll={false}>
              All
            </Link>
            <Link href="/?source=coin" className={filterClass(sourceFilter === "coin")} scroll={false}>
              Coin slot
            </Link>
            <Link href="/?source=jcard" className={filterClass(sourceFilter === "jcard")} scroll={false}>
              JCard
            </Link>
          </nav>
        </section>

        <p className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <span className="text-amber-400/90">Coin (last 7 days):</span>{" "}
          <span className="font-semibold tabular-nums text-white">{sumCoin7}</span>
          <span className="mx-3 text-slate-600">·</span>
          <span className="text-sky-300/90">JCard (last 7 days):</span>{" "}
          <span className="font-semibold tabular-nums text-white">{sumJcard7}</span>
        </p>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label={labels.allTime} value={stats.totalAllTime} accent="from-sky-500/20 to-sky-600/5" />
          <StatCard label={labels.today} value={stats.totalToday} accent="from-emerald-500/20 to-emerald-600/5" />
          <StatCard label={labels.week} value={stats.totalLast7Days} accent="from-violet-500/20 to-violet-600/5" />
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Coin vs JCard — last 7 days
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Units sold per day, split by payment type (not affected by the filter above).
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{labels.recent}</h2>
          {stats.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No sales in this view. Try another filter or post from your devices.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {stats.recent.map((row) => {
                const card = Boolean(row.jcard);
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            card ? "bg-sky-500/20 text-sky-200" : "bg-amber-500/20 text-amber-200"
                          }`}
                        >
                          {card ? "JCard" : "Coin"}
                        </span>
                        <span className="font-mono text-xs text-sky-200/90">
                          {row.jcard
                            ? row.jcard
                            : row.source === "coin"
                              ? "Coin slot (₱5)"
                              : "—"}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        {row.createdAt.toLocaleString()}
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums text-slate-200">
                      +{row.quantity} {row.quantity === 1 ? "unit" : "units"}
                    </span>
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
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-linear-to-br ${accent} p-5 shadow-inner shadow-black/20`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
