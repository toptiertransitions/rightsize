import type { Metadata } from "next";
import { ALL_TOP_TIER_TIPS } from "@/content/tips";
import { TipsPage } from "@/components/tips/TipsPage";
import { brandCss, HEX_RE } from "@/lib/brands/shared";
import { dayOfYearChicago } from "@/lib/tips-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tips preview", robots: "noindex, nofollow" };

// The resident Tips page on its own, in a community's colors, for the phone
// preview on Tenant Config (framed there, so its breakpoints see a phone-
// width viewport). Access: the /admin/marketplace layout (Admin/Manager).
export default async function TipsPreviewPage({ searchParams }: { searchParams: Promise<{ p?: string; s?: string }> }) {
  const { p, s } = await searchParams;
  const primary = `#${p ?? ""}`;
  const secondary = `#${s ?? ""}`;
  const colors = HEX_RE.test(primary) && HEX_RE.test(secondary) ? brandCss(primary, secondary) : "";

  return (
    <div className="min-h-screen bg-cream-50">
      {colors && <style dangerouslySetInnerHTML={{ __html: colors }} />}
      <main className="px-4 py-8">
        <TipsPage tipOfDayIndex={dayOfYearChicago() % ALL_TOP_TIER_TIPS.length} />
      </main>
    </div>
  );
}
