"use client";

import { useEffect, useState, type ReactNode } from "react";
import { brandCss, type PublicBrand } from "@/lib/brands/shared";

// Sign-up / sign-in header: when the page was reached from a community join
// link (?brand=slug), shows that community's logo and colors, loaded from
// the public branding endpoint. Anything else (unknown slug, Draft brand,
// network error) keeps the normal Rightsize header passed as children.
export function BrandAuthHeader({ slug, children }: { slug: string | null; children: ReactNode }) {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) return;
    let cancelled = false;
    fetch(`/api/brands/public/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: PublicBrand | null) => { if (!cancelled && b) setBrand(b); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  if (!brand) return <>{children}</>;
  return (
    <div className="flex flex-col items-center">
      <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor, brand.secondaryColor) }} />
      {brand.logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.displayName} onError={() => setLogoFailed(true)} className="h-16 w-auto max-w-[220px] object-contain mb-2" />
      ) : (
        <p className="text-xl font-bold text-forest-700 mb-1">{brand.displayName}</p>
      )}
      {brand.subtitle && <p className="text-xs text-gray-500">{brand.subtitle}</p>}
      {brand.topTierVisibility !== "Minimal" && <p className="text-[11px] text-gray-400 mt-2">with Top Tier Transitions</p>}
    </div>
  );
}
