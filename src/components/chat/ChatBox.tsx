"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

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
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.meta.categories.map((c) => (
                    <button
                      key={c.id}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => handleChooseCategory(m, c.id, false)}
                    >
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.meta?.requiresCategory && m.meta.categories && (
                <div className="mt-2 flex flex-col gap-2 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="rounded-md border px-2 py-1 text-sm"
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Select a category</option>
                      {m.meta.categories.map((c) => (
                        <option key={`sel-${c.id}`} value={c.id}>
                          {c.emoji ? `${c.emoji} ` : ""}
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                        onClick={() => handleUseSelectedCategory(m, false)}
                      >
                        Use selected
                      </button>
                      <button
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                        onClick={() => handleUseSelectedCategory(m, true)}
                      >
                        Use & remember
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="rounded-md border px-2 py-1 text-sm"
                      placeholder="New category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <button
                      className="rounded-md border px-2 py-1 hover:bg-accent"
                      onClick={() => handleCreateAndUseCategory(m)}
                    >
                      Create & use (remember)
                    </button>
                  </div>
                  <p className="text-muted-foreground">Tip: I'll remember your choice for this vendor when you pick "Use & remember".</p>
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