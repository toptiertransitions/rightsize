import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getAllMemberships, getTenants, getStaffMembers, getAllLocalVendors } from "@/lib/airtable";
import { UsersClient } from "./UsersClient";
import { AdminHeader } from "../components/AdminHeader";

export type AdminUser = {
  clerkUserId: string;
  email: string;
  name: string;
  imageUrl: string;
  createdAt: string;
  lastActiveAt?: string;
  banned: boolean;
  systemRole?: string;
  staffMemberId?: string; // Airtable record ID for the StaffMember row (if any)
  hourlyRate?: number;    // Staff hourly pay rate
  isVendor?: boolean;     // Has a LocalVendors record with this ClerkUserId
  memberships: Array<{
    membershipId: string;
    tenantId: string;
    tenantName: string;
    role: string;
  }>;
};

export default async function AdminUsersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [memberships, tenants, staffMembers, localVendors, clerkRes] = await Promise.all([
    getAllMemberships().catch(() => []),
    getTenants().catch(() => []),
    getStaffMembers().catch(() => []),
    getAllLocalVendors().catch(() => []),
    (async () => {
      const client = await clerkClient();
      return client.users.getUserList({ limit: 100, orderBy: "-created_at" });
    })().catch(() => ({ data: [] as never[] })),
  ]);

  const staffRoleByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.role]));
  const staffIdByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.id]));
  const staffHourlyRateByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.hourlyRate]));
  const vendorClerkIds = new Set(localVendors.map(v => v.clerkUserId).filter(Boolean));

  const tenantMap = new Map(tenants.map(t => [t.id, t.name]));

  const membershipsByUser = new Map<string, AdminUser["memberships"]>();
  for (const m of memberships) {
    const list = membershipsByUser.get(m.userId) ?? [];
    list.push({
      membershipId: m.id,
      tenantId: m.tenantId,
      tenantName: tenantMap.get(m.tenantId) ?? "Unknown Project",
      role: m.role,
    });
    membershipsByUser.set(m.userId, list);
  }

  const users: AdminUser[] = clerkRes.data.map(u => ({
    clerkUserId: u.id,
    email: u.emailAddresses[0]?.emailAddress ?? "",
    name: (`${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || (u.emailAddresses[0]?.emailAddress ?? "Unknown"),
    imageUrl: u.imageUrl,
    createdAt: new Date(u.createdAt).toISOString(),
    lastActiveAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : undefined,
    banned: u.banned ?? false,
    systemRole: isTTTAdmin(u.id) ? "TTTAdmin" : (staffRoleByClerkId.get(u.id) ?? undefined),
    staffMemberId: staffIdByClerkId.get(u.id),
    hourlyRate: staffHourlyRateByClerkId.get(u.id),
    isVendor: vendorClerkIds.has(u.id),
    memberships: membershipsByUser.get(u.id) ?? [],
  }));

  const tenantList = tenants.map(t => ({ id: t.id, name: t.name, isTTT: t.isTTT ?? false }));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="users" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <UsersClient users={users} tenants={tenantList} currentUserId={userId} />
      </main>
    </div>
  );
}
