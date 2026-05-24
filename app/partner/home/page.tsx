import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPartnerContact, getPartnerProjectsByStage } from "@/lib/partner";
import {
  getTenantById,
  getPartnerPointsByCompany,
  getPartnerPoints,
  getReviewsForTenant,
  getReferralCompanyById,
} from "@/lib/airtable";
import type { PartnerPoint, GoogleReview } from "@/lib/types";

interface ProjectInfo {
  tenantId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  isArchived: boolean;
  stage: string;
}

export default async function PartnerHomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  const companyId = contact.referralCompanyId || null;

  const [projectsByStage, points, company] = await Promise.all([
    getPartnerProjectsByStage(contact).catch(() => [] as { tenantId: string; stage: string }[]),
    companyId
      ? getPartnerPointsByCompany(companyId).catch(() => [] as PartnerPoint[])
      : getPartnerPoints(contact.id).catch(() => [] as PartnerPoint[]),
    companyId ? getReferralCompanyById(companyId).catch(() => null) : Promise.resolve(null),
  ]);

  const tenants = await Promise.all(
    projectsByStage.map(({ tenantId }) => getTenantById(tenantId).catch(() => null))
  );

  const reviewArrays = await Promise.all(
    projectsByStage
      .filter(p => p.stage === "Won")
      .map(({ tenantId }) => getReviewsForTenant(tenantId).catch(() => []))
  );
  const recentReviews: GoogleReview[] = reviewArrays
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  // Merge stage + tenant data
  const enriched = projectsByStage
    .map(({ tenantId, stage }, i) => {
      const t = tenants[i];
      if (!t) return null;
      return {
        tenantId: t.id,
        name: t.name,
        address: t.address,
        city: t.city,
        state: t.state,
        isArchived: t.isArchived,
        stage,
      };
    })
    .filter(Boolean) as ProjectInfo[];

  const potentialProjects = enriched.filter(p => p.stage === "Proposing" && !p.isArchived);
  const currentProjects   = enriched.filter(p => p.stage === "Won" && !p.isArchived);
  const previousProjects  = enriched.filter(p => p.stage === "Won" && p.isArchived);

  const earned    = points.length;
  const redeemed  = points.filter((p) => p.redeemedAt).length;
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
            "Here's a snapshot of your referred projects and points."
          )}
        </p>
      </div>

      {/* Points Hero */}
      <div className="bg-[#2d4a3e] rounded-2xl p-6 text-white">
        <p className="text-sm font-medium text-white/60 mb-3">
          {companyName} Premier Partner Points
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

      {/* Current Projects */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Current Projects
          <span className="ml-2 text-sm font-normal text-gray-400">({currentProjects.length})</span>
        </h2>
        {currentProjects.length === 0 ? (
          <p className="text-sm text-gray-400">No active referred projects yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {currentProjects.map((p) => (
              <ProjectCard key={p.tenantId} project={p} />
            ))}
          </div>
        )}
      </section>

      {/* Potential Projects */}
      {potentialProjects.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Potential Projects
            <span className="ml-2 text-sm font-normal text-gray-400">({potentialProjects.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {potentialProjects.map((p) => (
              <ProjectCard key={p.tenantId} project={p} potential />
            ))}
          </div>
        </section>
      )}

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

function ProjectCard({
  project,
  dimmed,
  potential,
}: {
  project: ProjectInfo;
  dimmed?: boolean;
  potential?: boolean;
}) {
  const locationParts = [project.city, project.state].filter(Boolean);
  return (
    <Link
      href={`/partner/plans?t=${project.tenantId}`}
      className={`block bg-white border rounded-xl px-4 py-3 hover:shadow-sm transition-shadow ${
        dimmed ? "border-gray-100 opacity-60" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{project.name}</p>
        {potential && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            In Progress
          </span>
        )}
      </div>
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
