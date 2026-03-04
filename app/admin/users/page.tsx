import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isTTTAdmin } from "@/lib/config";
import { getAllMemberships, getTenants, getStaffMembers } from "@/lib/airtable";
import { UserButton } from "@clerk/nextjs";
import { UsersClient } from "./UsersClient";

export type AdminUser = {
  clerkUserId: string;
  email: string;
  name: string;
  imageUrl: string;
  createdAt: string;
  banned: boolean;
  systemRole?: string;
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

  const [memberships, tenants, staffMembers, clerkRes] = await Promise.all([
    getAllMemberships().catch(() => []),
    getTenants().catch(() => []),
    getStaffMembers().catch(() => []),
    (async () => {
      const client = await clerkClient();
      return client.users.getUserList({ limit: 100, orderBy: "-created_at" });
    })().catch(() => ({ data: [] as never[] })),
  ]);

  const staffRoleByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.role]));

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
    banned: u.banned ?? false,
    systemRole: isTTTAdmin(u.id) ? "TTTAdmin" : (staffRoleByClerkId.get(u.id) ?? undefined),
    memberships: membershipsByUser.get(u.id) ?? [],
  }));

  const tenantList = tenants.map(t => ({ id: t.id, name: t.name }));

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-white text-sm">Rightsize</div>
                <div className="text-[9px] text-gray-400">TTT Admin Console</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/admin" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Projects</Link>
              <Link href="/admin/users" className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-white font-medium">Users</Link>
              <Link href="/admin/local-vendors" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Local Vendors</Link>
              <Link href="/admin/integrations/circle-hand" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Circle Hand</Link>
              <Link href="/admin/contract-services" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Contract & Services</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded-full font-medium">🔐 Admin</span>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <UsersClient users={users} tenants={tenantList} />
      </main>
    </div>
  );
}
