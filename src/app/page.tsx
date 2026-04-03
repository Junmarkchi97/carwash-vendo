import { getDashboardStats } from "@/lib/sales";

export const dynamic = "force-dynamic";

function formatDayLabel(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default async function Home() {
  const stats = await getDashboardStats();

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    t.setDate(t.getDate() - i);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
  }

  const byDay = new Map(stats.dailyLast7.map((r) => [r.day, r.total]));
  const series = days.map((day) => ({
    day,
    total: byDay.get(day) ?? 0,
    label: formatDayLabel(day),
  }));

  const maxBar = Math.max(1, ...series.map((s) => s.total));

  return (
    <div className="min-h-full bg-linear-to-b from-sky-950 via-slate-950 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-sky-400/90">
              JEYS CARWASH
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Sales dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Totals update when your ESP32 posts to{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-sky-200">
                /api/sales
              </code>
              .
            </p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="All-time sales (units)" value={stats.totalAllTime} accent="from-sky-500/20 to-sky-600/5" />
          <StatCard label="Today" value={stats.totalToday} accent="from-emerald-500/20 to-emerald-600/5" />
          <StatCard label="Last 7 days" value={stats.totalLast7Days} accent="from-violet-500/20 to-violet-600/5" />
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Last 7 days
          </h2>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
            {series.map((s) => (
              <div key={s.day} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-12 rounded-t-md bg-linear-to-t from-sky-600 to-sky-400 transition-all"
                  style={{ height: `${(s.total / maxBar) * 100}%`, minHeight: s.total > 0 ? "4px" : "0" }}
                  title={`${s.total} on ${s.day}`}
                />
                <span className="text-center text-[10px] leading-tight text-slate-500 sm:text-xs">
                  {s.label.split(" ").slice(0, 2).join(" ")}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent submissions
          </h2>
          {stats.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No sales yet. POST from your board to see events here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {stats.recent.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {row.createdAt.toLocaleString()}
                  </span>
                  <span className="tabular-nums text-slate-200">
                    +{row.quantity} {row.quantity === 1 ? "unit" : "units"}
                  </span>
                </li>
              ))}
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
