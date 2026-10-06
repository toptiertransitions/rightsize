import Link from "next/link";
import { PartnerLogo } from "@/components/partners/PartnerLogo";
import { RatingStars } from "@/components/partners/RatingStars";
import type { MarketplaceDeliveryMode } from "@/lib/marketplace/types";

export interface PartnerCardData {
  slug: string;
  companyName: string;
  logo?: string;
  shortBio?: string;
  cardAttributes: string[]; // 2-3 showOnCard field labels/values, already formatted
  avgRating: number;
  reviewCount: number;
  deliveryMode: MarketplaceDeliveryMode;
  hasReferralDisclosure: boolean;
}

function DeliveryPill({ mode }: { mode: MarketplaceDeliveryMode }) {
  if (mode === "In-person") return null;
  const label = mode === "Both" ? "In-person + Virtual" : "Virtual";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

// Same card everywhere: the category grid links here with a static preview,
// the category list page uses the real thing. categoryHref lets both share
// this one component.
export function PartnerCard({ partner, categoryHref }: { partner: PartnerCardData; categoryHref: string }) {
  return (
    <Link
      href={`${categoryHref}/${partner.slug}`}
      className="flex gap-4 rounded-2xl border border-gray-100 p-4 sm:p-5 bg-white hover:border-forest-200 hover:shadow-sm transition-all"
    >
      <PartnerLogo logo={partner.logo} name={partner.companyName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{partner.companyName}</h3>
          <DeliveryPill mode={partner.deliveryMode} />
        </div>
        {partner.shortBio && <p className="text-sm text-gray-500 line-clamp-1 mb-1.5">{partner.shortBio}</p>}
        {partner.cardAttributes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {partner.cardAttributes.map((a, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100">{a}</span>
            ))}
          </div>
        )}
        <RatingStars rating={partner.avgRating} reviewCount={partner.reviewCount} />
        {partner.hasReferralDisclosure && (
          <p className="text-[10px] text-gray-400 mt-1.5">Top Tier Transitions may receive a referral fee from this partner.</p>
        )}
      </div>
    </Link>
  );
}
