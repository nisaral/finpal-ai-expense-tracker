"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      meta?: {
        requiresCategory?: boolean;
        categories?: Array<{ id: number; name: string; emoji?: string | null; color?: string | null }>;
        parsed?: { description: string; vendor: string; amountCents: number; date: string };
        suggestedCategory?: { id: number; name: string; emoji?: string | null } | null;
      };
    };

export const ChatBox = () => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! Tell me an expense like 'dinner 250' or ask 'How much did I spend this month?'.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  // New: category selection + creation state when assistant asks to choose
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const formatINR = (cents: number) => {
    const rupees = cents / 100;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(rupees);
  };

  // normalize snake_case | camelCase from API
  const amountCentsOf = (obj: any): number => {
    if (!obj) return 0;
    const v = obj.amountCents ?? obj.amount_cents;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };

  // Ensure numbers are prefixed with ₹ so the parser/db doesn't drop the amount
  const normalizeRupeeMessage = (text: string) => {
    return text
      .split(/\s+/)
      .map((tok) => {
        const t = tok.trim();
        if (!t) return t;
        if (t.startsWith("₹")) return t;
        // ignore tokens like "rs" or "inr"
        if (/^(rs\.?|inr)$/i.test(t)) return t;
        const numeric = t.replace(/,/g, "");
        if (/^\d+(?:\.\d+)?$/.test(numeric)) return `₹${numeric}`;
        return t;
      })
      .join(" ");
  };

  const sendToParser = async (
    message: string,
    opts?: { autoCommit?: boolean; categoryId?: number }
  ) => {
    const res = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: normalizeRupeeMessage(message), autoCommit: opts?.autoCommit ?? false, category_id: opts?.categoryId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to parse");
    return data;
  };

  const looksLikeSummary = (text: string) => {
    const t = text.toLowerCase();
    return t.includes("how much") || t.includes("spend") || t.includes("spent") || t.startsWith("show ");
  };

  const isAffirmative = (text: string) => /^(yes|y|yeah|yep|sure|ok|okay|confirm)$/i.test(text.trim());
  const isNegative = (text: string) => /^(no|n|nope|nah|cancel)$/i.test(text.trim());

  const handleSummary = async (text: string) => {
    try {
      // naive category extraction: "on food" / "on <word>"
      const m = text.toLowerCase().match(/on\s+([a-z&\s]+)/i);
      const categoryQuery = m?.[1]?.trim();
      const qs = new URLSearchParams();
      qs.set("period", "currentCycle");
      if (categoryQuery) qs.set("category", categoryQuery);
      const res = await fetch(`/api/summaries?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to get summary");

      const spent = data?.totals?.spent_cents ?? 0;
      const byCat: Array<{ name: string; spent_cents: number }> = (data?.totals?.by_category || []).map((c: any) => ({ name: c.name, spent_cents: c.spent_cents }));

      if (categoryQuery) {
        const match = byCat.find((c) => c.name.toLowerCase().includes(categoryQuery));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: match
              ? `You\u2019ve spent ${formatINR(match.spent_cents)} on ${match.name} in this cycle.`
              : `No spending found for ${categoryQuery} in this cycle.`,
          },
        ]);
      } else if (byCat.length) {
        const top = byCat
          .slice(0, 5)
          .map((c) => `${c.name}: ${formatINR(c.spent_cents)}`)
          .join("\n");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `This cycle total: ${formatINR(spent)}\nTop categories:\n${top}`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", text: `This cycle total: ${formatINR(spent)}.` },
        ]);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to get summary");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: "Sorry, I couldn't fetch that summary." },
      ]);
    }
  };

  const handleBudgetQuery = async (text: string) => {
    try {
      // Extract category from "budget for [category]?"
      const m = text.toLowerCase().match(/budget\s+for\s+([a-z&\s]+)/i);
      const categoryQuery = m?.[1]?.trim();
      
      // Fetch budgets for the category (or all if no specific)
      const budgetQs = new URLSearchParams({ period: 'currentCycle' });
      if (categoryQuery) budgetQs.set('category', categoryQuery);
      const budgetRes = await fetch(`/api/budgets?${budgetQs.toString()}`);
      const budgetData = await budgetRes.json();
      if (!budgetRes.ok) throw new Error(budgetData?.error || 'Failed to get budgets');
      
      // Fetch spent for comparison
      const summaryQs = new URLSearchParams({ period: 'currentCycle' });
      if (categoryQuery) summaryQs.set('category', categoryQuery);
      const summaryRes = await fetch(`/api/summaries?${summaryQs.toString()}`);
      const summaryData = await summaryRes.json();
      if (!summaryRes.ok) throw new Error(summaryData?.error || 'Failed to get spending');
      
      const spentCents = summaryData?.totals?.spent_cents ?? 0;
      const budgetCents = budgetData?.budgets?.[0]?.allocated_cents ?? 0;
      const remainingCents = Math.max(0, budgetCents - spentCents);
      const usedPercent = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
      
      let response = categoryQuery 
        ? `Your budget for ${categoryQuery}: ${formatINR(budgetCents)}. Spent: ${formatINR(spentCents)} (${usedPercent}%). Remaining: ${formatINR(remainingCents)}.`
        : `Total budget: ${formatINR(sumBudgetAllocated(budgetData.budgets))}. Total spent: ${formatINR(spentCents)}.`;
      
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: response }]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to get budget info');
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'Sorry, couldn\'t fetch budget details. Check your budgets in settings.' }]);
    }
  };

  // Helper to sum budget allocation
  const sumBudgetAllocated = (budgets: Array<any>) => budgets.reduce((sum, b) => sum + (b.allocated_cents || 0), 0);

  // Handle recurring status
  const handleRecurringQuery = async () => {
    try {
      const res = await fetch('/api/recurring?limit=10');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to get recurring');
      
      if (data.length === 0) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'No recurring expenses set up yet.' }]);
        return;
      }
      
      const list = data.map((r: any) => 
        `${r.description}: ${formatINR(r.amountCents)} on ${r.dayOfMonth}th (${r.active ? 'active' : 'inactive'})`
      ).join('\n');
      
      setMessages((prev) => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        text: `Your recurring expenses:\n${list}\n\nSet more in Settings.` 
      }]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to get recurring');
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'Sorry, couldn\'t fetch recurring expenses.' }]);
    }
  };

  // Handle trend questions
  const handleTrendQuery = async (text: string) => {
    try {
      // Fetch last 3 months for trend
      const periods = ['lastMonth', 'thisMonth', 'currentCycle']; // Adjust as needed
      const trends: Array<{ period: string; spent: number }> = [];
      
      for (const p of periods) {
        const qs = new URLSearchParams({ period: p });
        const res = await fetch(`/api/summaries?${qs.toString()}`);
        const data = await res.json();
        if (res.ok) trends.push({ period: p, spent: data.totals?.spent_cents ?? 0 });
      }
      
      const latest = trends[trends.length - 1]?.spent || 0;
      const previous = trends[trends.length - 2]?.spent || 0;
      const change = latest - previous;
      const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
      
      const summary = trends.map(t => `${t.period}: ${formatINR(t.spent)}`).join('\n');
      const trendText = change > 0 
        ? `Spending is up ${changePercent}% (${formatINR(change)}).`
        : change < 0 
        ? `Spending is down ${Math.abs(changePercent)}% (${formatINR(Math.abs(change))}).`
        : 'Spending is stable.';
      
      setMessages((prev) => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        text: `${summary}\n\n${trendText}` 
      }]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to get trends');
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'Sorry, couldn\'t fetch spending trends.' }]);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      // Handle quick confirmations ("yes"/"no") and free-text category names in reply to assistant prompts
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const t = trimmed.toLowerCase();
      const isYes = ["yes", "y", "yeah", "yup", "sure", "ok", "okay", "confirm"].includes(t);
      const isNo = ["no", "n", "nope", "cancel"].includes(t);
      if (lastAssistant && lastAssistant.meta?.parsed) {
        // If we previously suggested a category and user said yes -> commit directly
        if (isYes && lastAssistant.meta?.suggestedCategory) {
          const original = [...messages].reverse().find((mm) => mm.role === "user") as Message | undefined;
          const originalText = original?.role === "user" ? original.text : input.trim();

          // Re-parse and auto-commit using the original user message to ensure amount is correctly derived (avoids ₹0.00)
          const commit = await fetch("/api/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: normalizeRupeeMessage(originalText),
              autoCommit: true,
              category_id: lastAssistant.meta.suggestedCategory.id,
            }),
          });
          const data = await commit.json();
          if (!commit.ok) throw new Error(data?.error || "Failed to add transaction");

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: `✅ Added ${formatINR(amountCentsOf(data.transaction))} to ${data.transaction?.category?.name || lastAssistant.meta.suggestedCategory?.name}.`,
            },
          ]);
          setIsSending(false);
          return;
        }
        // If assistant asked to choose a category, try to match by name from user's text
        if (lastAssistant.meta?.requiresCategory && lastAssistant.meta.categories?.length) {
          if (isNo) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "assistant", text: "Okay, not added.", },
            ]);
            setIsSending(false);
            return;
          }
          const name = trimmed.toLowerCase();
          const found = lastAssistant.meta.categories.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().includes(name));
          if (!found) {
            const list = lastAssistant.meta.categories.slice(0, 8).map((c) => c.name).join(", ");
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "assistant", text: `That's not a valid category. Try one of: ${list}` },
            ]);
            setIsSending(false);
            return;
          }
          // Reuse existing path which also optionally saves a rule
          await handleChooseCategory(lastAssistant, found.id, false);
          setIsSending(false);
          return;
        }
      }

      // Detect budget query
      if (t.includes('budget for') || t.includes('budget?') || t.includes('remaining budget')) {
        await handleBudgetQuery(trimmed);
        return;
      }
      
      // Detect recurring query
      if (t.includes('recurring') || t.includes('subscription') || t.includes('subscriptions')) {
        await handleRecurringQuery();
        return;
      }
      
      // Detect trend query
      if (t.includes('trend') || t.includes('compare spending') || t.includes('month over month')) {
        await handleTrendQuery(trimmed);
        return;
      }

      if (looksLikeSummary(trimmed)) {
        await handleSummary(trimmed);
        return;
      }

      // If this looks like a summary question, you could route to /api/summaries here later.
      const parsed = await sendToParser(trimmed, { autoCommit: false });

      if (parsed.requiresCategory) {
        const assistant: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `I haven't seen that before. Which category does this belong to?`,
          meta: {
            requiresCategory: true,
            categories: parsed.categories,
            parsed: parsed.parsed,
          },
        };
        setMessages((prev) => [...prev, assistant]);
        toast.message("Pick a category to teach me.");
      } else if (parsed.parsed && (parsed.parsed.suggestedCategory || parsed.parsed.suggested_category)) {
        const cat = parsed.parsed.suggestedCategory || parsed.parsed.suggested_category;
        const amount = amountCentsOf(parsed.parsed);
        const assistant: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Looks like ${cat.name}. Add ${formatINR(amount)} to ${cat.name}?`,
          meta: { suggestedCategory: cat, parsed: parsed.parsed },
        };
        setMessages((prev) => [...prev, assistant]);
      } else if (parsed.parsed) {
        const amt = amountCentsOf(parsed.parsed);
        const assistant: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Parsed: ${formatINR(amt)} on ${parsed.parsed.vendor}. Add it?`,
          meta: { parsed: parsed.parsed },
        };
        setMessages((prev) => [...prev, assistant]);
      } else if (parsed.success && parsed.transaction) {
        const t = parsed.transaction;
        const amt = amountCentsOf(t);
        const assistant: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `✅ Added ${formatINR(amt)} to ${t.category?.name || "category"}.`,
        };
        setMessages((prev) => [...prev, assistant]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", text: "I parsed that, but I'm not sure what to do next." },
        ]);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to parse message");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: "Sorry, I couldn't understand that. Try like 'coffee 120'." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleChooseCategory = async (
    m: Message,
    categoryId: number,
    teachAndRemember: boolean
  ) => {
    if (m.role !== "assistant" || !m.meta?.parsed) return;
    const original = messages.findLast((mm) => mm.role === "user");
    const keyword = m.meta.parsed.vendor || "";

    try {
      // Create vendor rule if asked to remember
      if (teachAndRemember && keyword) {
        const vr = await fetch("/api/vendor-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword, category_id: categoryId }),
        });
        if (!vr.ok) {
          const dj = await vr.json();
          // Ignore duplicate gracefully
          if (dj?.code !== "DUPLICATE_KEYWORD") {
            throw new Error(dj?.error || "Failed to save rule");
          }
        }
      }

      // Now autoCommit the original message (and force category)
      const commit = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: original && (original as any).role === "user" ? normalizeRupeeMessage((original as any).text) : normalizeRupeeMessage(m.meta.parsed.description),
          autoCommit: true,
          category_id: categoryId,
        }),
      });
      const data = await commit.json();
      if (!commit.ok) throw new Error(data?.error || "Failed to add transaction");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `👍 Added ${formatINR(amountCentsOf(data.transaction))} to ${data.transaction.category?.name}.`,
        },
      ]);
      toast.success("Expense added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add expense");
    }
  };

  // Use selected category from dropdown
  const handleUseSelectedCategory = async (m: Message, remember: boolean) => {
    if (selectedCategoryId === "") return toast.error("Please pick a category");
    await handleChooseCategory(m, Number(selectedCategoryId), remember);
    setSelectedCategoryId("");
  };

  // Create a new category then use it (and remember vendor rule)
  const handleCreateAndUseCategory = async (m: Message) => {
    const name = newCategoryName.trim();
    if (!name) return toast.error("Enter a category name");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const cat = await res.json();
      if (!res.ok) throw new Error(cat?.error || "Failed to create category");
      setNewCategoryName("");
      await handleChooseCategory(m, Number(cat.id), true);
    } catch (e: any) {
      toast.error(e.message || "Could not create category");
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border">
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                "inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground")
              }
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === "assistant" && m.meta?.requiresCategory && m.meta.categories && (
                <div className="mt-2 flex flex-col gap-2 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Combobox
                      options={m.meta.categories.map(cat => ({
                        value: cat.id.toString(),
                        label: `${cat.emoji ? `${cat.emoji} ` : ""}${cat.name}`,
                      }))}
                      onSelect={(value) => setSelectedCategoryId(Number(value))}
                      placeholder="Select a category"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseSelectedCategory(m, false)}
                        disabled={!selectedCategoryId}
                      >
                        Use selected
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseSelectedCategory(m, true)}
                        disabled={!selectedCategoryId}
                      >
                        Use & remember
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="New category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCreateAndUseCategory(m)}
                      disabled={!newCategoryName.trim()}
                    >
                      Create & use (remember)
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">Tip: I'll remember your choice for this vendor when you pick "Use & remember".</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2 max-sm:flex-col">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isSending) handleSend();
              }
            }}
            placeholder="e.g. dinner 250 or 'how much this month'"
            className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={isSending || input.trim().length === 0}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50 max-sm:w-full"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;