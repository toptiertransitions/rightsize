import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { isTTTAdmin } from "@/lib/config";
import { getReferralCompanies, getReferralContacts, getLocalVendors, createLocalVendor } from "@/lib/airtable";

// One-time-ish, re-runnable sync: every CRM Referral Company of Type
// "Senior Living" that has at least one Referral Contact in the "Active
// Referral" stage gets a LocalVendors entry with Category = "Community", so
// it shows up in the client-facing Partners page's Community section.
// Idempotent — skips any company whose name already matches an existing
// Community-category LocalVendor (case-insensitive), so it's safe to
// re-run whenever new communities go active in the CRM.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [companies, contacts, localVendors] = await Promise.all([
      getReferralCompanies(),
      getReferralContacts(),
      getLocalVendors(),
    ]);

    const activeReferralCompanyIds = new Set(
      contacts.filter((c) => c.stage === "Active Referral").map((c) => c.referralCompanyId)
    );
    const qualifying = companies.filter(
      (c) => c.type === "Senior Living" && activeReferralCompanyIds.has(c.id)
    );

    const existingCommunityNames = new Set(
      localVendors.filter((v) => v.category === "Community").map((v) => v.vendorName.trim().toLowerCase())
    );

    const created: string[] = [];
    const skipped: string[] = [];
    for (const company of qualifying) {
      if (existingCommunityNames.has(company.name.trim().toLowerCase())) {
        skipped.push(company.name);
        continue;
      }
      await createLocalVendor({
        vendorType: "Future Home/Community",
        vendorName: company.name,
        address: company.address,
        city: company.city,
        state: company.state,
        zip: company.zip,
        website: company.website,
        category: "Community",
        isActive: true,
      });
      created.push(company.name);
      existingCommunityNames.add(company.name.trim().toLowerCase());
    }

    if (created.length > 0) revalidateTag("partners-directory");

    return NextResponse.json({
      qualifyingCount: qualifying.length,
      created,
      skipped,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
