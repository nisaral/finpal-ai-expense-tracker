"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Category = {
  id: number;
  name: string;
  emoji?: string | null;
  color?: string | null;
};

type BudgetResponse = {
  total_monthly_budget_cents: number | null;
  cycle_start_day: number;
  category_budgets: Array<{
    category_id: number;
    monthly_limit_cents: number | null;
    category: Category;
  }>;
};

type Recurring = {
  id: number;
  description: string; // was name
  vendor?: string | null;
  amountCents: number;
  categoryId: number;
  dayOfMonth: number; // 1-28/31
};

export const SettingsForm = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [totalBudget, setTotalBudget] = useState<string>(""); // rupees input
  const [cycleStartDay, setCycleStartDay] = useState<number>(1);
  const [categoryLimits, setCategoryLimits] = useState<Record<number, string>>({}); // rupees per category

  // Category management (add-only)
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("");
  const [newCatColor, setNewCatColor] = useState("");

  // Recurring expenses UI
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [recLoad, setRecLoad] = useState(false);
  const [recSaving, setRecSaving] = useState(false);
  const [recForm, setRecForm] = useState<{
    name: string;
    vendor: string;
    amount: string; // rupees
    categoryId: number | "";
    dayOfMonth: number | "";
  }>({ name: "", vendor: "", amount: "", categoryId: "", dayOfMonth: "" });
  // inline edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    description: string;
    vendor: string;
    amount: string; // rupees
    categoryId: number | "";
    dayOfMonth: number | "";
  }>({ description: "", vendor: "", amount: "", categoryId: "", dayOfMonth: "" });

  useEffect(() => {
    const load = async () => {
      try {
        const [catsRes, budgetRes] = await Promise.all([
          fetch("/api/categories?limit=200", { cache: "no-store" }),
          fetch("/api/budgets", { cache: "no-store" }),
        ]);
        const catsJson: Category[] = await catsRes.json();
        const budgetJson: BudgetResponse = await budgetRes.json();
        if (!catsRes.ok) throw new Error("Failed to load categories");
        if (!budgetRes.ok) throw new Error("Failed to load budget");
        setCategories(catsJson);
        setCycleStartDay(budgetJson.cycle_start_day ?? 1);
        setTotalBudget(
          budgetJson.total_monthly_budget_cents != null
            ? (budgetJson.total_monthly_budget_cents / 100).toString()
            : ""
        );
        const limits: Record<number, string> = {};
        for (const cb of budgetJson.category_budgets || []) {
          if (cb.category && cb.monthly_limit_cents != null) {
            limits[cb.category.id] = (cb.monthly_limit_cents / 100).toString();
          }
        }
        setCategoryLimits(limits);
      } catch (e: any) {
        toast.error(e.message || "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load recurring
  const loadRecurring = async () => {
    try {
      setRecLoad(true);
      const r = await fetch("/api/recurring", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load recurring");
      setRecurring(Array.isArray(j?.items) ? j.items : j);
    } catch (e: any) {
      toast.error(e.message || "Failed to load recurring");
    } finally {
      setRecLoad(false);
    }
  };

  useEffect(() => {
    loadRecurring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      // Build payload
      const payload: any = {
        cycle_start_day: cycleStartDay,
      };

      // total budget in cents (optional)
      if (totalBudget.trim().length > 0) {
        const rupees = parseFloat(totalBudget);
        if (isNaN(rupees) || rupees < 0) throw new Error("Invalid total budget amount");
        payload.total_monthly_budget_cents = Math.round(rupees * 100);
      } else {
        payload.total_monthly_budget_cents = null;
      }

      // category budgets
      const cbs: Array<{ category_id: number; monthly_limit_cents: number }> = [];
      for (const c of categories) {
        const v = categoryLimits[c.id];
        if (v != null && v.trim() !== "") {
          const rupees = parseFloat(v);
          if (isNaN(rupees) || rupees < 0) {
            throw new Error(`Invalid amount for ${c.name}`);
          }
          cbs.push({ category_id: c.id, monthly_limit_cents: Math.round(rupees * 100) });
        }
      }
      payload.category_budgets = cbs;

      const res = await fetch("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji: newCatEmoji || undefined, color: newCatColor || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to add category");
      setCategories((prev) => [...prev, j]);
      setNewCatName("");
      setNewCatEmoji("");
      setNewCatColor("");
      toast.success("Category added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add category");
    }
  };

  const handleAddRecurring = async () => {
    const { name, vendor, amount, categoryId, dayOfMonth } = recForm;
    if (!name.trim() || !amount.trim() || !categoryId || !dayOfMonth) {
      toast.error("Fill all recurring fields");
      return;
    }
    try {
      setRecSaving(true);
      const rupees = parseFloat(amount);
      if (isNaN(rupees) || rupees <= 0) throw new Error("Invalid amount");
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: name.trim(), // API expects description
          vendor: vendor.trim() || null,
          amount_cents: Math.round(rupees * 100),
          category_id: Number(categoryId),
          day_of_month: Number(dayOfMonth),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to add recurring");
      toast.success("Recurring added");
      setRecForm({ name: "", vendor: "", amount: "", categoryId: "", dayOfMonth: "" });
      loadRecurring();
    } catch (e: any) {
      toast.error(e.message || "Failed to add recurring");
    } finally {
      setRecSaving(false);
    }
  };

  const handleRunRecurring = async () => {
    try {
      const res = await fetch("/api/recurring/run", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to run recurring");
      toast.success("Recurring executed");
    } catch (e: any) {
      toast.error(e.message || "Failed to run recurring");
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    try {
      const res = await fetch(`/api/recurring?id=${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to delete recurring");
      toast.success("Recurring deleted");
      loadRecurring();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete recurring");
    }
  };

  const startEdit = (r: Recurring) => {
    setEditId(r.id);
    setEditForm({
      description: r.description,
      vendor: r.vendor || "",
      amount: (r.amountCents / 100).toString(),
      categoryId: r.categoryId,
      dayOfMonth: r.dayOfMonth,
    });
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const handleUpdateRecurring = async () => {
    if (editId == null) return;
    const { description, vendor, amount, categoryId, dayOfMonth } = editForm;
    if (!description.trim() || !amount.toString().trim() || !categoryId || !dayOfMonth) {
      toast.error("Fill all fields to update");
      return;
    }
    try {
      const rupees = parseFloat(amount as string);
      if (isNaN(rupees) || rupees <= 0) throw new Error("Invalid amount");
      const res = await fetch(`/api/recurring?id=${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          vendor: vendor.trim() || null,
          amount_cents: Math.round(rupees * 100),
          category_id: Number(categoryId),
          day_of_month: Number(dayOfMonth),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to update recurring");
      toast.success("Recurring updated");
      setEditId(null);
      loadRecurring();
    } catch (e: any) {
      toast.error(e.message || "Failed to update recurring");
    }
  };

  const cycleDays = useMemo(() => Array.from({ length: 28 }, (_, i) => i + 1), []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <label className="text-sm font-medium">Total Monthly Budget (₹)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            placeholder="e.g. 50000"
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <p className="mt-1 text-xs text-muted-foreground">Leave blank if you don't want a total budget.</p>
        </div>
        <div className="rounded-lg border p-4">
          <label className="text-sm font-medium">My Month Starts On</label>
          <select
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={cycleStartDay}
            onChange={(e) => setCycleStartDay(parseInt(e.target.value))}
            disabled={loading}
          >
            {cycleDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Choose any day from 1 to 28.</p>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">Per-category Monthly Limits (₹)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
              <div className="text-sm">
                <span className="font-medium">{c.emoji ? `${c.emoji} ` : ""}{c.name}</span>
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={categoryLimits[c.id] ?? ""}
                onChange={(e) =>
                  setCategoryLimits((prev) => ({ ...prev, [c.id]: e.target.value }))
                }
                placeholder="e.g. 5000"
                className="w-28 rounded-md border px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Category management */}
      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">Add a Category</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. Shopping"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Emoji</label>
            <input
              value={newCatEmoji}
              onChange={(e) => setNewCatEmoji(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm w-24"
              placeholder="🛍️"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Color</label>
            <input
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm w-32"
              placeholder="#00AA88"
            />
          </div>
          <button onClick={handleAddCategory} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground">Add</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Note: Delete/rename categories isn't available yet.</p>
      </div>

      {/* Recurring expenses */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Recurring Expenses</p>
          <div className="flex items-center gap-2">
            <button onClick={loadRecurring} className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Refresh</button>
            <button onClick={handleRunRecurring} className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Run now</button>
          </div>
        </div>
        <div className="space-y-2">
          {recLoad ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring items.</p>
          ) : (
            recurring.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-md border p-2 text-sm">
                {editId === r.id ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      className="rounded-md border px-2 py-1 text-sm"
                      placeholder="Description"
                    />
                    <input
                      value={editForm.vendor}
                      onChange={(e) => setEditForm((f) => ({ ...f, vendor: e.target.value }))}
                      className="rounded-md border px-2 py-1 text-sm"
                      placeholder="Vendor"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                      className="rounded-md border px-2 py-1 text-sm"
                      placeholder="Amount (₹)"
                    />
                    <select
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
                      className="rounded-md border px-2 py-1 text-sm"
                    >
                      <option value="">Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji ? `${c.emoji} ` : ""}
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editForm.dayOfMonth}
                      onChange={(e) => setEditForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                      className="rounded-md border px-2 py-1 text-sm"
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button onClick={handleUpdateRecurring} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Save</button>
                      <button onClick={cancelEdit} className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{r.description}</span>
                      <span className="text-muted-foreground">{r.vendor || "—"}</span>
                      <span className="text-muted-foreground">Day {r.dayOfMonth}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(r.amountCents / 100)}</span>
                      <button onClick={() => startEdit(r)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">Edit</button>
                      <button onClick={() => handleDeleteRecurring(r.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={recForm.name}
              onChange={(e) => setRecForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Netflix"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Vendor (optional)</label>
            <input
              value={recForm.vendor}
              onChange={(e) => setRecForm((f) => ({ ...f, vendor: e.target.value }))}
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="netflix"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Amount (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={recForm.amount}
              onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))}
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="649"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Category</label>
            <select
              value={recForm.categoryId}
              onChange={(e) => setRecForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Day of Month</label>
            <select
              value={recForm.dayOfMonth}
              onChange={(e) => setRecForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAddRecurring}
              disabled={recSaving}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50"
            >
              {recSaving ? "Adding..." : "Add Recurring"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
};

export default SettingsForm;