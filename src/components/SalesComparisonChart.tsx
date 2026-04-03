"use client";

import { formatPeso } from "@/lib/currency";
import type { CoinJcardDayRow } from "@/lib/sales";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: CoinJcardDayRow[];
};

export function SalesComparisonChart({ data }: Props) {
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={2}
          barCategoryGap="12%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: "rgba(148, 163, 184, 0.9)", fontSize: 11 }}
            axisLine={{ stroke: "rgba(148, 163, 184, 0.2)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(148, 163, 184, 0.9)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              const v = Number.isFinite(n) ? n : 0;
              const label = name === "coin" ? "Coin slot" : "JCard";
              return [formatPeso(v), label];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as CoinJcardDayRow | undefined;
              return row?.label ?? "";
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            formatter={(value) =>
              value === "coin" ? "Coin slot" : "JCard"
            }
          />
          <Bar
            dataKey="coin"
            name="coin"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="jcard"
            name="jcard"
            fill="#38bdf8"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
