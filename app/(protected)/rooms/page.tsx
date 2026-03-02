import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getRoomsForTenant,
  getUserRoleForTenant,
  getTenantById,
  getMembershipsForUser,
} from "@/lib/airtable";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RoomsClient, AddRoomButton } from "./RoomsClient";
import type { Room, Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function RoomsPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  // ── Single-tenant mode ───────────────────────────────────────────────────────
  if (tenantId) {
    const [tenant, role, rooms] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getUserRoleForTenant(userId, tenantId).catch(() => null),
      getRoomsForTenant(tenantId).catch(() => []),
    ]);

    if (!tenant) redirect("/dashboard");
    if (!role) redirect("/dashboard");

    const canEdit = EDIT_ROLES.includes(role);

    return (
      <div>
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
              <Button variant="secondary">View Catalog</Button>
            </Link>
            {canEdit && <AddRoomButton tenantId={tenantId} />}
          </div>
        </div>

        <RoomsClient rooms={rooms} tenantId={tenantId} canEdit={canEdit} />
      </div>
    );
  }

  // ── All-projects mode ────────────────────────────────────────────────────────
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  if (memberships.length === 0) redirect("/dashboard");

  const tenantIds = memberships.map((m) => m.tenantId);

  const [tenantObjects, roomArrays] = await Promise.all([
    Promise.all(tenantIds.map((tid) => getTenantById(tid).catch(() => null))),
    Promise.all(tenantIds.map((tid) => getRoomsForTenant(tid).catch(() => []))),
  ]);

  const projects: Array<{ tenant: Tenant; rooms: Room[]; canEdit: boolean }> = tenantObjects
    .map((tenant, i) => ({
      tenant: tenant!,
      rooms: roomArrays[i],
      canEdit: EDIT_ROLES.includes(memberships[i].role),
    }))
    .filter((p) => p.tenant != null);

  const totalRooms = projects.reduce((sum, p) => sum + p.rooms.length, 0);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/dashboard" className="hover:text-forest-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">All Rooms</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
        <p className="text-gray-500 mt-0.5">
          {totalRooms} room{totalRooms !== 1 ? "s" : ""} across {projects.length} project{projects.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-10">
        {projects.map(({ tenant, rooms, canEdit }) => (
          <section key={tenant.id}>
            {/* Project header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{tenant.name}</h2>
                <p className="text-sm text-gray-400">
                  {rooms.length} room{rooms.length !== 1 ? "s" : ""} ·{" "}
                  {rooms.reduce((sum, r) => sum + r.squareFeet, 0).toLocaleString()} SF
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/catalog?tenantId=${tenant.id}`}>
                  <Button variant="secondary" className="text-sm">Catalog</Button>
                </Link>
                <Link href={`/rooms?tenantId=${tenant.id}`}>
                  <Button variant="secondary" className="text-sm">Manage</Button>
                </Link>
              </div>
            </div>

            {rooms.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No rooms added yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <Link key={room.id} href={`/rooms?tenantId=${tenant.id}`}>
                    <Card className="hover:border-forest-200 hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-800 truncate">{room.name}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {room.roomType} · {room.squareFeet.toLocaleString()} SF · {room.density}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
