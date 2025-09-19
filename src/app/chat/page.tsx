import { ChatBox } from "@/components/chat/ChatBox";

export default function ChatPage() {
  return (
    <main className="container mx-auto px-4 py-10">
      <section className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="text-muted-foreground">Type messages like "dinner 250" or "paid 500 for groceries". I'll parse the amount and auto-categorize it.</p>
        <ChatBox />
      </section>
    </main>
  );
}