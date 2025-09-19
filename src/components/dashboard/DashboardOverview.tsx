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

  useEffect(() => {
    const load = async () => {
      try {
        const bRes = await fetch(`/api/budgets`, { cache: "no-store" });
        const bJson: BudgetResponse = await bRes.json();
        if (!bRes.ok) throw new Error("Failed to load budget");
        setBudget(bJson);

        const cycleDay = bJson.cycle_start_day ?? 1;
        const sRes = await fetch(`/api/summaries?period=currentCycle&cycleStartDay=${cycleDay}`);
        const sJson: SummaryResponse = await sRes.json();
        if (!sRes.ok) throw new Error("Failed to load summary");
        setSummary(sJson);
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
    </section>
  );
};

export default DashboardOverview;