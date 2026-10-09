// Which community brand (if any) a signed-in user sees. Server-only.
//
// Order:
//  1. Admin/Manager "View as" preview cookie (any status, display only)
//  2. Staff always see Top Tier
//  3. The brand on one of the user's projects (Tenant.CommunityBrandId):
//     invited family members inherit it automatically through the project
//  4. The brand on the user record (join link / community code before a
//     project exists), read from Clerk publicMetadata.brandSlug, which is
//     written together with the Airtable Users record
// Only Active brands brand live users. Any lookup failure falls back to Top
// Tier, so a slow or failing Airtable never blocks a page.
import "server-only";
import { cookies } from "next/headers";
import type { Tenant } from "@/lib/types";
import type { CommunityBrand } from "./shared";
import { getAllBrands } from "./data";
import { PREVIEW_COOKIE, verifyValue } from "./cookies";

export interface ResolvedBrand {
  brand: CommunityBrand;
  /** True for an admin's "View as" preview */
  preview: boolean;
}

export function canPreviewBrands(sysRole: string | null | undefined): boolean {
  return sysRole === "TTTAdmin" || sysRole === "TTTManager";
}

export async function resolveBrand(params: {
  sysRole: string | null;
  tenants?: Array<Pick<Tenant, "communityBrandId"> | null>;
  brandSlug?: string | null;
}): Promise<ResolvedBrand | null> {
  try {
    if (params.sysRole) {
      if (!canPreviewBrands(params.sysRole)) return null;
      const jar = await cookies();
      const previewId = verifyValue(jar.get(PREVIEW_COOKIE)?.value);
      if (!previewId) return null;
      const brand = (await getAllBrands()).find((b) => b.id === previewId);
      return brand ? { brand, preview: true } : null;
    }

    const brands = await getAllBrands();
    const active = (b: CommunityBrand | undefined) => (b && b.status === "Active" ? b : undefined);

    for (const t of params.tenants ?? []) {
      if (!t?.communityBrandId) continue;
      const b = active(brands.find((x) => x.id === t.communityBrandId));
      if (b) return { brand: b, preview: false };
    }

    if (params.brandSlug) {
      const b = active(brands.find((x) => x.slug === params.brandSlug));
      if (b) return { brand: b, preview: false };
    }
    return null;
  } catch (e) {
    console.error("[brands] resolve failed, using Top Tier:", e);
    return null;
  }
}
