import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";
import { AdminHeader } from "../components/AdminHeader";
import { PayAdminClient } from "./PayAdminClient";

export default async function AdminPayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (role !== "TTTManager" && role !== "TTTAdmin") redirect("/home");

  const staffMembers = await getStaffMembers().catch(() => []);
  const staffList = staffMembers
    .filter(s => s.isActive)
    .map(s => ({ clerkUserId: s.clerkUserId, displayName: s.displayName }));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="pay" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Payroll Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Manage hours, commission, mileage, and expense reimbursements for TTT staff.</p>
        </div>
        <PayAdminClient staffMembers={staffList} />
      </main>
    </div>
  );
}
