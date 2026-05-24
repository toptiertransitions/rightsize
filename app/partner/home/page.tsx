import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPartnerContact } from "@/lib/partner";
import {
  getPartnerTenantIdsByCompany,
  getPartnerTenantIds,
  getTenantById,
  getPartnerPointsByCompany,
  getPartnerPoints,
  getReviewsForTenant,
  getReferralCompanyById,
} from "@/lib/airtable";
import type { PartnerProject, PartnerPoint, GoogleReview } from "@/lib/types";

export default async function PartnerHomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  const companyId = contact.referralCompanyId || null;

  const [tenantIds, points, company] = await Promise.all([
    companyId
      ? getPartnerTenantIdsByCompany(companyId).catch(() => [] as string[])
      : getPartnerTenantIds(contact.id).catch(() => [] as string[]),
    companyId
      ? getPartnerPointsByCompany(companyId).catch(() => [] as PartnerPoint[])
      : getPartnerPoints(contact.id).catch(() => [] as PartnerPoint[]),
    companyId ? getReferralCompanyById(companyId).catch(() => null) : Promise.resolve(null),
  ]);

  const tenants = await Promise.all(tenantIds.map((id) => getTenantById(id).catch(() => null)));

  const reviewArrays = await Promise.all(
    tenantIds.map((id) => getReviewsForTenant(id).catch(() => []))
  );
  const recentReviews: GoogleReview[] = reviewArrays
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const projects: PartnerProject[] = tenants
    .filter(Boolean)
    .map((t) => ({
      tenantId: t!.id,
      name: t!.name,
      address: t!.address,
      city: t!.city,
      state: t!.state,
      status: t!.isArchived ? ("previous" as const) : ("active" as const),
    }));

  const activeProjects = projects.filter((p) => p.status === "active");
  const previousProjects = projects.filter((p) => p.status === "previous");

  const earned = points.length;
  const redeemed = points.filter((p) => p.redeemedAt).length;
  const available = earned - redeemed;

  const companyName = company?.name || contact.name.split(" ").slice(-1)[0];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-[#2d4a3e]">
          Welcome back, {contact.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {company ? (
            <>Viewing all referral activity for <strong>{company.name}</strong>.</>
          ) : (
            "Here’s a snapshot of your referred projects and points."
          )}
        </p>
      </div>

      {/* Points Hero */}
      <div className="bg-[#2d4a3e] rounded-2xl p-6 text-white">
        <p className="text-sm font-medium text-white/60 mb-3">
          {companyName} Referral Points
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-3xl font-bold">{available}</p>
            <p className="text-xs text-white/60 mt-1">Available</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{earned}</p>
            <p className="text-xs text-white/60 mt-1">Total Earned</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{redeemed}</p>
            <p className="text-xs text-white/60 mt-1">Redeemed</p>
          </div>
        </div>
        {earned > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              {points.slice(0, 5).map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                    p.redeemedAt
                      ? "bg-white/10 text-white/40"
                      : "bg-[#C9A96E]/20 text-[#C9A96E]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                  {p.tenantName || "Project"} &middot; {p.earnedAt}
                  {p.redeemedAt ? " (redeemed)" : ""}
                </span>
              ))}
              {points.length > 5 && (
                <span className="text-xs text-white/40 px-2.5 py-1">
                  +{points.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Active Projects */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Current Projects
          <span className="ml-2 text-sm font-normal text-gray-400">({activeProjects.length})</span>
        </h2>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-gray-400">No active referred projects yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeProjects.map((p) => (
              <ProjectCard key={p.tenantId} project={p} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Reviews */}
      {recentReviews.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Google Reviews</h2>
          <div className="space-y-3">
            {recentReviews.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-base leading-none" aria-label={`${r.stars} stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={i < r.stars ? "text-amber-400" : "text-gray-200"}>★</span>
                    ))}
                  </span>
                  <span className="text-xs text-gray-400">{r.createdAt}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Previous Projects */}
      {previousProjects.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Previous Projects
            <span className="ml-2 text-sm font-normal text-gray-400">({previousProjects.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {previousProjects.map((p) => (
              <ProjectCard key={p.tenantId} project={p} dimmed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectCard({ project, dimmed }: { project: PartnerProject; dimmed?: boolean }) {
  const locationParts = [project.city, project.state].filter(Boolean);
  return (
    <Link
      href={`/partner/plan/${project.tenantId}`}
      className={`block bg-white border rounded-xl px-4 py-3 hover:shadow-sm transition-shadow ${
        dimmed ? "border-gray-100 opacity-60" : "border-gray-200"
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{project.name}</p>
      {project.address && (
        <p className="text-xs text-gray-400 mt-0.5 truncate">{project.address}</p>
      )}
      {locationParts.length > 0 && (
        <p className="text-xs text-gray-400 mt-0.5">{locationParts.join(", ")}</p>
      )}
      <p className="text-xs text-[#2d4a3e] mt-2 font-medium">View plan &rarr;</p>
    </Link>
  );
}
