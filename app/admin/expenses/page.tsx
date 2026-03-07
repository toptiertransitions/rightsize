import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getExpenses } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { AdminExpensesClient } from "./AdminExpensesClient";

export default async function AdminExpensesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") redirect("/home");

  const expenses = await getExpenses().catch(() => []);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="expenses" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <AdminExpensesClient initialExpenses={expenses} />
      </main>
    </div>
  );
}
