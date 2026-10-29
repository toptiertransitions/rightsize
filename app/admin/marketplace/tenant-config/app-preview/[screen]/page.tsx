import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL_TOP_TIER_TIPS } from "@/content/tips";
import { TipsPage } from "@/components/tips/TipsPage";
import { ItemGrid } from "@/components/catalog/ItemGrid";
import { Button } from "@/components/ui/Button";
import { SalesClient } from "@/app/(protected)/sales/SalesClient";
import { InvoicesClient } from "@/app/(protected)/invoices/InvoicesClient";
import { getItemsForTenant, getRoomsForTenant } from "@/lib/airtable";
import { brandCss, HEX_RE } from "@/lib/brands/shared";
import { dayOfYearChicago } from "@/lib/tips-access";
import type { Tenant } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "App preview", robots: "noindex, nofollow" };

// Resident app screens on their own, in a community's colors, for the phone
// preview on Tenant Config (framed there, so their breakpoints see a phone-
// width viewport). Access: the /admin/marketplace layout (Admin/Manager).
//
// Everything here is view-only. Catalog shows the app-review demo project's
// items (DEMO_TENANT_IDS), never a real client's; Sales and Invoices show a
// new Top Tier client's empty pages rather than anyone's real money data.
const SCREENS = ["tips", "catalog", "sales", "invoices"] as const;

const SAMPLE_TENANT: Tenant = {
  id: "preview",
  airtableId: "preview",
  name: "The Smith Move",
  slug: "preview",
  plan: "free",
  ownerUserId: "",
  createdAt: new Date().toISOString(),
  isTTT: true,
};

export default async function AppPreviewPage({ params, searchParams }: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ p?: string; s?: string }>;
}) {
  const { screen } = await params;
  if (!(SCREENS as readonly string[]).includes(screen)) notFound();
  const { p, s } = await searchParams;
  const primary = `#${p ?? ""}`;
  const secondary = `#${s ?? ""}`;
  const colors = HEX_RE.test(primary) && HEX_RE.test(secondary) ? brandCss(primary, secondary) : "";

  let body: React.ReactNode;
  if (screen === "tips") {
    body = <TipsPage tipOfDayIndex={dayOfYearChicago() % ALL_TOP_TIER_TIPS.length} />;
  } else if (screen === "catalog") {
    const demoId = (process.env.DEMO_TENANT_IDS ?? "").split(",").map((x) => x.trim()).find(Boolean);
    const [items, rooms] = demoId
      ? await Promise.all([getItemsForTenant(demoId).catch(() => []), getRoomsForTenant(demoId).catch(() => [])])
      : [[], []];
    body = (
      <div>
        <div className="flex flex-col gap-4 mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
          <div><Button type="button">Add Item</Button></div>
        </div>
        <ItemGrid items={items} canEdit={false} rooms={rooms} isTTT={false} />
      </div>
    );
  } else if (screen === "sales") {
    body = (
      <SalesClient
        tenantId="preview" tenantName={SAMPLE_TENANT.name} ownerEmail="" items={[]} vendors={[]} rooms={[]} localVendors={[]}
        paymentProofFiles={[]} pfSaleEvents={[]} canEdit={false} canEditPayout={false} canPayoutClient={false} canDeleteProof={false} isTTT
      />
    );
  } else {
    body = (
      <InvoicesClient
        tenant={SAMPLE_TENANT} initialInvoices={[]} isManager={false} services={[]} invoiceSettings={null} contracts={[]} agreements={[]}
        timeEntries={[]} recipientOptions={[]} defaultBillToName={SAMPLE_TENANT.name} currentUserEmail=""
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream-50">
      {colors && <style dangerouslySetInnerHTML={{ __html: colors }} />}
      {/* View-only: no taps reach the app's data */}
      <main className={screen === "tips" ? "px-4 py-8" : "px-4 py-8 [&_a]:pointer-events-none"}>{body}</main>
    </div>
  );
}
