import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRoomsForTenant, getUserRoleForTenant, getTenantById } from "@/lib/airtable";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RoomsClient, AddRoomButton } from "./RoomsClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function RoomsPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/dashboard");

  const [tenant, role, rooms] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
  ]);

  if (!tenant) redirect("/dashboard");
  if (!role) redirect("/dashboard");

  const canEdit = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(role);

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-forest-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
          <p className="text-gray-500 mt-0.5">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} ·{" "}
            {rooms.reduce((sum, r) => sum + r.squareFeet, 0).toLocaleString()} total SF
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/catalog?tenantId=${tenantId}`}>
            <Button variant="secondary">
              View Catalog
            </Button>
          </Link>
          {canEdit && (
            <AddRoomButton tenantId={tenantId} />
          )}
        </div>
      </div>

      <RoomsClient
        rooms={rooms}
        tenantId={tenantId}
        canEdit={canEdit}
      />
    </div>
  );
}
