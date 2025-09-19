import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <main className="container mx-auto px-4 py-10">
      <section className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your monthly budget, cycle start day, category limits, and recurring expenses.</p>
        <SettingsForm />
      </section>
    </main>
  );
}