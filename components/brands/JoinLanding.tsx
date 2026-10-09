import Link from "next/link";
import { brandCss, type CommunityBrand } from "@/lib/brands/shared";

// Branded landing for /join/[slug] (the community's join link / QR code).
export function JoinLanding({ brand }: { brand: CommunityBrand }) {
  const minimal = brand.topTierVisibility === "Minimal";
  const sender = [brand.welcomeSenderName, brand.welcomeSenderTitle].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor, brand.secondaryColor) }} />
      <div className="h-2 bg-forest-600" />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-md mx-auto w-full">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.displayName} className="h-20 w-auto max-w-[240px] object-contain" />
        ) : (
          <p className="text-2xl font-bold text-forest-700">{brand.displayName}</p>
        )}
        {brand.subtitle && <p className="text-sm text-gray-500 mt-2">{brand.subtitle}</p>}

        <h1 className="text-2xl font-bold text-gray-900 mt-8 leading-snug">
          {minimal ? "Plan your move, one step at a time" : `${brand.displayName} and Top Tier are here to help with your move`}
        </h1>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          Create a free account to get a moving plan, checklists, and a direct line to your {brand.displayName.replace(/^the\s+/i, "")} contacts.
        </p>

        {brand.welcomeMessage && (
          <blockquote className="mt-6 w-full bg-white border border-cream-200 rounded-2xl p-4 text-left">
            <p className="text-sm text-gray-700 leading-relaxed">{brand.welcomeMessage}</p>
            {sender && <p className="text-xs text-gray-500 mt-2">{sender}</p>}
          </blockquote>
        )}

        <Link href={`/join/${brand.slug}/start`} className="mt-8 w-full inline-flex items-center justify-center h-12 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-semibold">
          Get started
        </Link>
        <Link href={`/join/${brand.slug}/start?signin=1`} className="mt-3 text-sm text-gray-500 underline">
          I already have an account
        </Link>
      </main>
      <p className="text-center text-[11px] text-gray-400 px-4 pb-8">
        {minimal ? "Powered by Rightsize" : "Move management by Top Tier Transitions · Powered by Rightsize"}
      </p>
    </div>
  );
}
