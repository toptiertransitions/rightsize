import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact, getPartnerProjectsByStage } from "@/lib/partner";
import { getTenantById, getPlanEntriesForTenant, getProjectFiles, getPartnerTenantIdsByCompany } from "@/lib/airtable";
import type { PlanEntry, ProjectFile } from "@/lib/types";
import { ProjectSelector } from "./ProjectSelector";
import { PartnerCalendar } from "./PartnerCalendar";

export default async function PartnerPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  const { t } = await searchParams;

  // CRM-chain projects
  const projectsByStage = await getPartnerProjectsByStage(contact).catch(() => [] as { tenantId: string; stage: string }[]);
  const crmTenantIds = projectsByStage
    .filter(p => p.stage !== "Lost" && p.stage !== "Lead" && p.stage !== "Qualifying")
    .map(p => p.tenantId);

  // Backfill path: tenants with ReferralCompanyId set directly
  const backfillTenantIds = contact.referralCompanyId
    ? await getPartnerTenantIdsByCompany(contact.referralCompanyId).catch(() => [] as string[])
    : [];

  const allTenantIds = Array.from(new Set([...crmTenantIds, ...backfillTenantIds]));

  const allTenants = (
    await Promise.all(allTenantIds.map((id) => getTenantById(id).catch(() => null)))
  ).filter(Boolean);

  const activeProjects = allTenants
    .filter((ten) => !ten!.isArchived)
    .map((ten) => ({ tenantId: ten!.id, name: ten!.name }));

  if (activeProjects.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[#2d4a3e]">Project Plans</h1>
        <p className="text-sm text-gray-400">No active referred projects yet.</p>
      </div>
    );
  }

  // Determine selected project (default to "all")
  const selectedId = (t && (t === "all" || activeProjects.some((p) => p.tenantId === t))) ? t : "all";
  const isAllMode = selectedId === "all";

  // Fetch plan entries + files for selected project(s)
  const [entries, files]: [PlanEntry[], ProjectFile[]] = await Promise.all([
    isAllMode
      ? Promise.all(activeProjects.map((p) => getPlanEntriesForTenant(p.tenantId).catch(() => [] as PlanEntry[])))
          .then((arrays) => arrays.flat())
      : getPlanEntriesForTenant(selectedId).catch(() => [] as PlanEntry[]),
    isAllMode
      ? Promise.all(activeProjects.map((p) => getProjectFiles(p.tenantId).catch(() => [] as ProjectFile[])))
          .then((arrays) => arrays.flat())
      : getProjectFiles(selectedId).catch(() => [] as ProjectFile[]),
  ]);

  const floorplans = files.filter((f) => f.fileTag === "Floorplan");
  const selectedProject = isAllMode ? null : activeProjects.find((p) => p.tenantId === selectedId);

  return (
    <div className="space-y-8">
      {/* Header with project selector */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-[#2d4a3e]">
            {selectedProject ? selectedProject.name : "Project Plans"}
          </h1>
          {isAllMode && (
            <p className="text-sm text-gray-500 mt-1">Showing all {activeProjects.length} active referred project{activeProjects.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:block">Filter by project:</span>
          <ProjectSelector projects={activeProjects} selectedId={selectedId} />
        </div>
      </div>

      {/* Calendar */}
      <PartnerCalendar
        entries={entries}
        projects={activeProjects}
        selectedTenantId={selectedId}
      />

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
                  <img src={f.cloudinaryUrl} alt={f.fileName} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gray-50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600 truncate">{f.fileName}</p>
                  {isAllMode && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">
                      {activeProjects.find(p => p.tenantId === f.tenantId)?.name ?? ""}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
