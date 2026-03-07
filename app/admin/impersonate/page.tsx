import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getRoomsForTenant,
  getItemsForTenant,
  getMembershipsForTenant,
} from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { UserButton } from "@clerk/nextjs";
import { ItemGrid } from "@/components/catalog/ItemGrid";
import { Card, CardContent } from "@/components/ui/Card";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function ImpersonatePage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/admin");

  const [tenant, rooms, items, memberships] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
    getItemsForTenant(tenantId).catch(() => []),
    getMembershipsForTenant(tenantId).catch(() => []),
  ]);

  if (!tenant) redirect("/admin");

  const totalSqFt = rooms.reduce((sum, r) => sum + r.squareFeet, 0);

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Impersonation Banner */}
      <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="text-sm font-medium">
            TTT Staff View — <strong>{tenant.name}</strong>
          </span>
        </div>
        <Link
          href="/admin"
          className="text-sm underline hover:no-underline font-medium"
        >
          ← Exit to Admin Console
        </Link>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-cream-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{tenant.name}</h1>
            <p className="text-sm text-gray-400 font-mono select-all">{tenant.id}</p>
          </div>
          <UserButton  />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Rooms", value: rooms.length, icon: "🏠" },
            { label: "Total SF", value: totalSqFt.toLocaleString(), icon: "📐" },
            { label: "Items Cataloged", value: items.length, icon: "📦" },
            { label: "Team Members", value: memberships.length, icon: "👥" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="text-center py-5">
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-2xl font-bold text-forest-700">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Rooms */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Rooms</h2>
          {rooms.length === 0 ? (
            <p className="text-gray-400 text-sm">No rooms added yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rooms.map((room) => (
                <Card key={room.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-800">{room.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {room.roomType} · {room.squareFeet.toLocaleString()} SF · {room.density}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Item Catalog */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Item Catalog</h2>
            <Link
              href={`/catalog/new?tenantId=${tenantId}`}
              className="text-sm text-forest-600 font-medium hover:underline"
            >
              + Add Item
            </Link>
          </div>
          <ItemGrid items={items} tenantId={tenantId} canEdit={true} rooms={rooms} />
        </section>

        {/* Team */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Team Members</h2>
          {memberships.length === 0 ? (
            <p className="text-gray-400 text-sm">No members.</p>
          ) : (
            <div className="space-y-2">
              {memberships.map((m) => (
                <Card key={m.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-700 font-mono">{m.userId}</span>
                    <span className="text-xs bg-forest-50 text-forest-700 border border-forest-200 px-2 py-0.5 rounded-full">
                      {m.role}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
