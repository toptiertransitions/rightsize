import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPartnerContact, partnerHasAccessToTenant } from "@/lib/partner";
import { getPlanEntriesForTenant, getTenantById, getProjectFiles } from "@/lib/airtable";
import type { PlanEntry, ProjectFile } from "@/lib/types";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

export default async function PartnerPlanPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  const { tenantId } = await params;
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId);
  if (!hasAccess) notFound();

  const [tenant, entries, files] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getPlanEntriesForTenant(tenantId).catch(() => [] as PlanEntry[]),
    getProjectFiles(tenantId).catch(() => [] as ProjectFile[]),
  ]);

  if (!tenant) notFound();

  const floorplans = files.filter((f) => f.fileTag === "Floorplan");
  const focusEntries = entries.filter((e) => e.entryType !== "keydate");
  const keyDates = entries.filter((e) => e.entryType === "keydate");

  // Group focus entries by date
  const byDate = new Map<string, PlanEntry[]>();
  for (const e of focusEntries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const sortedDates = [...byDate.keys()].sort();

  const locationParts = [tenant.address, tenant.city, tenant.state].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Back */}
      <div>
        <Link href="/partner/home" className="text-sm text-[#2d4a3e] hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Project header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#2d4a3e]">{tenant.name}</h1>
        {locationParts.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">{locationParts.join(", ")}</p>
        )}
      </div>

      {/* Key Dates */}
      {keyDates.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Key Dates</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keyDates.sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
              <div key={e.id} className="bg-[#2d4a3e]/5 border border-[#2d4a3e]/10 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-[#2d4a3e]">{e.activity}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDate(e.date)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Schedule */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Schedule
          <span className="ml-2 text-sm font-normal text-gray-400">({sortedDates.length} days)</span>
        </h2>
        {sortedDates.length === 0 ? (
          <p className="text-sm text-gray-400">No schedule entries yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedDates.map((date) => {
              const dayEntries = byDate.get(date)!;
              return (
                <div key={date} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{formatDate(date)}</p>
                  <div className="space-y-1">
                    {dayEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2d4a3e] flex-shrink-0" />
                        <span className="text-sm text-gray-800">{e.activity}</span>
                        {e.roomLabel && (
                          <span className="text-xs text-gray-400">— {e.roomLabel}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Floorplans */}
      {floorplans.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Floorplans</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {floorplans.map((f) => (
              <a
                key={f.id}
                href={f.cloudinaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
              >
                {f.resourceType === "image" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.cloudinaryUrl}
                    alt={f.fileName}
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="w-full h-40 bg-gray-50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600 truncate">{f.fileName}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
