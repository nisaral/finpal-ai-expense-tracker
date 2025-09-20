"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type BudgetResponse = {
  total_monthly_budget_cents: number | null;
  cycle_start_day: number;
  category_budgets: Array<{
    category_id: number;
    monthly_limit_cents: number | null;
    category: { id: number; name: string; emoji?: string | null; color?: string | null };
  }>;
};

type SummaryResponse = {
  period_info?: {
    start_date: string;
    end_date: string;
    cycle_start_day: number;
  };
  totals: {
    spent_cents: number;
    by_category: Array<{ category_id: number; name: string; spent_cents: number }>;
  };
  burn_rate_cents_per_day?: number;
};

const formatINR = (cents: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((cents || 0) / 100);

export const DashboardOverview = () => {
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [weekly, setWeekly] = useState<SummaryResponse | null>(null);
  const [monthly, setMonthly] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const bRes = await fetch(`/api/budgets`, { cache: "no-store" });
        const bJson: BudgetResponse = await bRes.json();
        if (!bRes.ok) throw new Error("Failed to load budget");
        setBudget(bJson);

        const cycleDay = bJson.cycle_start_day ?? 1;
        const [sRes, wRes, mRes] = await Promise.all([
          fetch(`/api/summaries?period=currentCycle&cycleStartDay=${cycleDay}`),
          fetch(`/api/summaries?period=currentWeek`),
          fetch(`/api/summaries?period=currentMonth`),
        ]);
        const [sJson, wJson, mJson] = await Promise.all([sRes.json(), wRes.json(), mRes.json()]);
        if (!sRes.ok) throw new Error("Failed to load summary");
        setSummary(sJson);
        if (wRes.ok) setWeekly(wJson);
        if (mRes.ok) setMonthly(mJson);
      } catch (e: any) {
        toast.error(e.message || "Failed to load dashboard data");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const kpis = useMemo(() => {
    const totalBudget = budget?.total_monthly_budget_cents ?? null;
    const spent = summary?.totals.spent_cents ?? 0;
    const left = totalBudget != null ? Math.max(0, totalBudget - spent) : null;
    const burn = summary?.burn_rate_cents_per_day ?? Math.round((spent || 0) / 30);
    return { totalBudget, spent, left, burn };
  }, [budget, summary]);

  // simple pie chart component (SVG)
  const PieChart = ({ data }: { data: Array<{ label: string; value: number; color: string }> }) => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let cumulative = 0;
    const radius = 48;
    const cx = 60;
    const cy = 60;
    const toXY = (t: number) => {
      const a = Math.PI * 2 * t - Math.PI / 2;
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    };
    return (
      <svg width={120} height={120} viewBox="0 0 120 120" className="mx-auto">
        {data.map((d, i) => {
          const start = cumulative / total;
          const end = (cumulative + d.value) / total;
          cumulative += d.value;
          const [sx, sy] = toXY(start);
          const [ex, ey] = toXY(end);
          const largeArc = end - start > 0.5 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey} Z`;
          return <path key={i} d={path} fill={d.color} className="transition-opacity" />;
        })}
        {/* inner circle for donut look */}
        <circle cx={cx} cy={cy} r={30} fill="var(--card)" />
      </svg>
    );
  };

  const palette = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  const toChartData = (s: SummaryResponse | null) =>
    (s?.totals.by_category || []).map((c, i) => ({
      label: c.name,
      value: c.spent_cents,
      color: palette[i % palette.length],
    }));

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your current cycle.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Budget</p>
          <div className="mt-2 text-2xl font-semibold">
            {isLoading ? "—" : kpis.totalBudget != null ? formatINR(kpis.totalBudget) : "Not set"}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Spent</p>
          <div className="mt-2 text-2xl font-semibold">{isLoading ? "—" : formatINR(kpis.spent)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Money Left</p>
          <div className="mt-2 text-2xl font-semibold">{isLoading ? "—" : kpis.left != null ? formatINR(kpis.left) : "—"}</div>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Burn Rate / day</p>
          <div className="mt-2 text-2xl font-semibold">{isLoading ? "—" : formatINR(kpis.burn || 0)}</div>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <p className="mb-4 text-sm text-muted-foreground">Spending by category</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(summary?.totals.by_category || []).map((c) => (
            <div key={c.category_id} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{c.name}</span>
              <span className="text-sm font-medium">{formatINR(c.spent_cents)}</span>
            </div>
          ))}
          {!isLoading && (summary?.totals.by_category?.length || 0) === 0 && (
            <p className="text-sm text-muted-foreground">No spending recorded in this period.</p>
          )}
        </div>
      </div>

      {/* Weekly / Monthly pie charts */}
      <div className="rounded-lg border p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium">Weekly & Monthly Breakdown</p>
          <span className="text-xs text-muted-foreground">Auto-updates from summaries</span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-md border p-4">
            <p className="mb-3 text-xs text-muted-foreground">This Week</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (weekly?.totals.by_category?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No data for this week.</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <PieChart data={toChartData(weekly)} />
                <div className="grid w-full grid-cols-2 gap-2 text-xs">
                  {toChartData(weekly).map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.label}</span>
                      <span className="ml-auto font-medium">{formatINR(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-md border p-4">
            <p className="mb-3 text-xs text-muted-foreground">This Month</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (monthly?.totals.by_category?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No data for this month.</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <PieChart data={toChartData(monthly)} />
                <div className="grid w-full grid-cols-2 gap-2 text-xs">
                  {toChartData(monthly).map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.label}</span>
                      <span className="ml-auto font-medium">{formatINR(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardOverview;