import { DashboardCustomersList } from "@/components/DashboardCustomersList";
import { DashboardFilteredSections } from "@/components/DashboardFilteredSections";
import type { DashboardStatsSerialized } from "@/components/DashboardFilteredSections";
import { SalesComparisonChart } from "@/components/SalesComparisonChart";
import { LiveRefresh } from "@/components/LiveRefresh";
import { formatPeso } from "@/lib/currency";
import { listCustomers, type CustomerListItem } from "@/lib/customers";
import { getJcardTapChargePesos } from "@/lib/settings";
import {
  coinSlotPricePhp,
  getCoinJcardDailyLast7,
  getDashboardStats,
  getLastJcardUseAtByJcards,
  parseSalesSourceFilter,
} from "@/lib/sales";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ source?: string }>;
};

function serializeDashboardStats(
  stats: Awaited<ReturnType<typeof getDashboardStats>>,
): DashboardStatsSerialized {
  return {
    totalAllTimePhp: stats.totalAllTimePhp,
    totalTodayPhp: stats.totalTodayPhp,
    totalLast7DaysPhp: stats.totalLast7DaysPhp,
    recent: stats.recent.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      revenuePhp: r.revenuePhp,
      source: r.source,
      jcardId: r.jcardId,
      customerName: r.customerName,
      customerBalancePhp: r.customerBalancePhp,
      customerJoinedAt: r.customerJoinedAt?.toISOString() ?? null,
      customerLastJcardUseAt: r.customerLastJcardUseAt?.toISOString() ?? null,
    })),
  };
}

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sourceFilter = parseSalesSourceFilter(sp.source);
  const coinSlotPhp = coinSlotPricePhp();
  let statsByFilter: Record<
    "all" | "coin" | "jcard",
    DashboardStatsSerialized
  > = {
    all: { totalAllTimePhp: 0, totalTodayPhp: 0, totalLast7DaysPhp: 0, recent: [] },
    coin: { totalAllTimePhp: 0, totalTodayPhp: 0, totalLast7DaysPhp: 0, recent: [] },
    jcard: { totalAllTimePhp: 0, totalTodayPhp: 0, totalLast7DaysPhp: 0, recent: [] },
  };
  let comparison: Awaited<ReturnType<typeof getCoinJcardDailyLast7>> = [];
  let customers: CustomerListItem[] = [];
  let lastJcardTapByJcard = new Map<string, Date>();
  let jcardTapPhp = 4;
  let dataError: string | null = null;

  try {
    const tap = await getJcardTapChargePesos();
    jcardTapPhp = tap.value;
    const pricing = { coinSlotPhp, jcardTapPhp };
    const [sAll, sCoin, sJcard, comp, cust] = await Promise.all([
      getDashboardStats("all", pricing),
      getDashboardStats("coin", pricing),
      getDashboardStats("jcard", pricing),
      getCoinJcardDailyLast7(),
      listCustomers(),
    ]);
    statsByFilter = {
      all: serializeDashboardStats(sAll),
      coin: serializeDashboardStats(sCoin),
      jcard: serializeDashboardStats(sJcard),
    };
    comparison = comp;
    customers = cust;
    lastJcardTapByJcard = await getLastJcardUseAtByJcards(
      customers.map((c) => c.jcard),
    );
  } catch (err) {
    console.error("Dashboard data load failed", err);
    dataError = "Data is temporarily unavailable (database connection failed).";
  }

  /** `getCoinJcardDailyLast7` returns coin vs JCard PHP per day (`price` per event). */
  const sumCoin7Php = comparison.reduce((s, r) => s + r.coin, 0);
  const sumJcard7Php = comparison.reduce((s, r) => s + r.jcard, 0);

  const summaryLine = (
    <div className="contents">
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
    </div>
  );

  const chartAndCustomers = (
    <div className="contents">
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Coin vs JCard — last 7 days (₱)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Per day from <code className="text-slate-400">price</code> per event. Not affected by the filter
            above.
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
          Customers
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Name, balance, JCard UID, joined / created date, and last JCard tap from{" "}
          <code className="text-slate-400">customers</code> +{" "}
          <code className="text-slate-400">sales_events</code>.
        </p>
        <DashboardCustomersList
          customers={customers.map((c) => ({
            jcard: c.jcard,
            name: c.name,
            balancePhp: c.balancePhp,
            joinedAt: c.joinedAt?.toISOString() ?? null,
            lastTapIso: lastJcardTapByJcard.get(c.jcard)?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );

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
              Amounts are in Philippine peso (₱): coin slot ×{" "}
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

        <DashboardFilteredSections
          initialSource={sourceFilter}
          statsByFilter={statsByFilter}
          coinSlotPhp={coinSlotPhp}
          jcardTapPhp={jcardTapPhp}
          summarySlot={summaryLine}
          chartAndCustomersSlot={chartAndCustomers}
        />
      </div>
    </div>
  );
}
