"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TxCategory = {
  id: number;
  name: string;
  emoji?: string | null;
  color?: string | null;
};

type Transaction = {
  id: number;
  date: string; // YYYY-MM-DD
  description: string;
  vendor?: string | null;
  amountCents: number;
  categoryId: number;
  category?: TxCategory | null;
};

type ListResponse = {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
};

const formatINR = (cents: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((cents || 0) / 100);

// normalize snake_case | camelCase from API
const amountCentsOf = (obj: any): number => {
  if (!obj) return 0;
  const v = (obj as any).amountCents ?? (obj as any).amount_cents;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

export const TransactionsTable = () => {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ListResponse | null>(null);
  const [categories, setCategories] = useState<TxCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Transaction>>({});

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    if (q.trim()) sp.set("q", q.trim());
    return sp.toString();
  }, [page, pageSize, q]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?${params}`, { cache: "no-store" });
      const json: ListResponse = await res.json();
      if (!res.ok) throw new Error((json as any)?.error || "Failed to load transactions");
      // normalize items to ensure amountCents/categoryId exist for UI safety
      const normalized = {
        ...json,
        items: (json.items || []).map((t: any) => ({
          ...t,
          amountCents: t.amountCents ?? t.amount_cents ?? 0,
          categoryId: t.categoryId ?? t.category_id ?? t.category?.id ?? 0,
        })),
      } as ListResponse;
      setData(normalized);
    } catch (e: any) {
      toast.error(e.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/categories?limit=200`, { cache: "no-store" });
        const j: TxCategory[] = await r.json();
        if (!r.ok) throw new Error((j as any)?.error || "Failed to load categories");
        setCategories(j);
      } catch (e: any) {
        // non-blocking
      }
    })();
  }, []);

  const totalPages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1), [data]);

  const startEdit = (t: Transaction) => {
    setEditingId(t.id);
    setEditDraft({ ...t });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const body = {
        id: editingId,
        date: editDraft.date,
        description: editDraft.description,
        vendor: editDraft.vendor,
        amount_cents: editDraft.amountCents, // send snake_case to API
        category_id: editDraft.categoryId,   // send snake_case to API
      };
      const res = await fetch(`/api/transactions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to update");
      toast.success("Transaction updated");
      cancelEdit();
      load();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };
  const deleteTx = async (id: number) => {
    try {
      const res = await fetch(`/api/transactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to delete");
      toast.success("Deleted");
      if (editingId === id) cancelEdit();
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Recent Transactions</h2>
        <div className="flex items-center gap-2 max-sm:w-full">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setPage(1);
            }}
            placeholder="Search (e.g. Swiggy)"
            className="h-9 w-56 rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-ring max-sm:w-full"
          />
          <button
            onClick={() => setPage(1)}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent max-sm:flex-1"
          >
            Search
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/60">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No transactions found.
                </td>
              </tr>
            )}
            {!loading && data &&
              data.items.map((t) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {editingId === t.id ? (
                      <input
                        type="date"
                        value={editDraft.date || t.date}
                        onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))}
                        className="w-40 rounded-md border px-2 py-1"
                      />
                    ) : (
                      t.date
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === t.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editDraft.description ?? t.description}
                          onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                          className="rounded-md border px-2 py-1"
                        />
                        <input
                          placeholder="Vendor (optional)"
                          value={editDraft.vendor ?? t.vendor ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, vendor: e.target.value }))}
                          className="rounded-md border px-2 py-1"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span className="font-medium">{t.description}</span>
                        {t.vendor && <span className="text-xs text-muted-foreground">{t.vendor}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === t.id ? (
                      <select
                        value={editDraft.categoryId ?? t.categoryId}
                        onChange={(e) => setEditDraft((d) => ({ ...d, categoryId: Number(e.target.value) }))}
                        className="w-44 rounded-md border px-2 py-1"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji ? `${c.emoji} ` : ""}
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : t.category ? (
                      <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                        {t.category.emoji ? `${t.category.emoji} ` : null}
                        {t.category.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {editingId === t.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={((editDraft.amountCents ?? amountCentsOf(t)) / 100).toString()}
                        onChange={(e) => {
                          const rupees = parseFloat(e.target.value || "0");
                          setEditDraft((d) => ({ ...d, amountCents: Math.round((isNaN(rupees) ? 0 : rupees) * 100) }));
                        }}
                        className="w-28 rounded-md border px-2 py-1 text-right"
                      />
                    ) : (
                      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amountCentsOf(t) / 100)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {editingId === t.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={saveEdit} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Save</button>
                        <button onClick={cancelEdit} className="rounded-md border px-3 py-1 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(t)} className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Edit</button>
                        <button onClick={() => deleteTx(t.id)} className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {data?.page || 1} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50 hover:bg-accent"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50 hover:bg-accent"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};

export default TransactionsTable;