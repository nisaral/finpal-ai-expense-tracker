import Link from "next/link";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-16">
      <section className="mx-auto max-w-3xl text-center space-y-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">FinPal — Your Financial Chat Buddy</h1>
          <p className="mt-3 text-muted-foreground">
            Chat your expenses like "dinner 250". I'll parse the amount, auto‑categorize, track budgets, and show summaries.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/chat" className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-primary-foreground hover:opacity-90">
            Open Chat
          </Link>
          <Link href="/dashboard" className="inline-flex h-11 items-center justify-center rounded-md border px-5 hover:bg-accent">
            View Dashboard
          </Link>
          <Link href="/settings" className="inline-flex h-11 items-center justify-center rounded-md border px-5 hover:bg-accent">
            Settings
          </Link>
        </div>
        <div className="mx-auto grid max-w-2xl gap-3 text-left sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="font-medium">Smart NLP</p>
            <p className="text-sm text-muted-foreground">Understands vendors and amounts from natural messages.</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Auto‑Categorization</p>
            <p className="text-sm text-muted-foreground">Prebuilt dictionary + personal vendor rules that learn.</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Budgets & Cycles</p>
            <p className="text-sm text-muted-foreground">Custom month start day and per‑category limits.</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Summaries</p>
            <p className="text-sm text-muted-foreground">Ask "How much this month?" and get instant answers.</p>
          </div>
        </div>
      </section>
    </main>
  );
}