import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";

export default function DashboardPage() {
  return (
    <main className="container mx-auto px-4 py-10">
      <div className="space-y-8">
        <DashboardOverview />
        <TransactionsTable />
      </div>
    </main>
  );
}