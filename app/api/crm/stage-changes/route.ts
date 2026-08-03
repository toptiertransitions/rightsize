import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralContactsWithRecentStageChange, getReferralCompanies, getStaffMembers } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!sysRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const [contacts, companies, staffMembers] = await Promise.all([
    getReferralContactsWithRecentStageChange(days),
    getReferralCompanies(),
    getStaffMembers(),
  ]);

  const companyMap = new Map(companies.map(c => [c.id, c]));
  const staffNameByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.displayName]));

  const rows = contacts
    .filter(c => c.previousStage && c.stageChangedAt)
    .map(c => {
      const company = companyMap.get(c.referralCompanyId);
      const ownerClerkId = company?.assignedToClerkId;
      return {
        contactId: c.id,
        contactName: c.name,
        contactTitle: c.title || null,
        companyId: c.referralCompanyId,
        companyName: company?.name ?? "Unknown",
        priority: company?.priority ?? "",
        ownerName: ownerClerkId ? (staffNameByClerkId.get(ownerClerkId) ?? "") : "",
        previousStage: c.previousStage!,
        currentStage: c.stage,
        stageChangedAt: c.stageChangedAt!,
        lastActivityDate: c.lastActivityDate ?? null,
        nextStepDate: c.nextStepDate ?? null,
        nextStepNote: c.nextStepNote ?? null,
      };
    })
    .sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt)); // most recent first

  return NextResponse.json({ rows });
}
