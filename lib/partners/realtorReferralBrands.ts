// Per-community switch for realtor referral fees (the RealtorReferralBrandSettings
// table). A community brand with no row, or with the box unchecked, is OFF:
// its co-branded clients see no referral-fee disclosure and no
// acknowledgments are tracked for them. Set on Tenant Config by TTT Admins.
import { unstable_cache, revalidateTag } from "next/cache";
import { AIRTABLE_TABLES } from "@/lib/config";

export const REFERRAL_BRANDS_CACHE_TAG = "realtor-referral-brands";

type Row = { id: string; fields: Record<string, unknown> };

function at(path: string, init?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.REALTOR_REFERRAL_BRAND_SETTINGS)}${path}`, {
    cache: "no-store",
    ...init,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function fetchRows(): Promise<Row[]> {
  const rows: Row[] = [];
  let offset: string | undefined;
  do {
    const res = await at(offset ? `?offset=${offset}` : "");
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    rows.push(...(data.records as Row[]));
    offset = data.offset;
  } while (offset);
  return rows;
}

/** Brand ids whose co-branded clients get the realtor referral disclosure. */
export const getReferralFeeBrandIds = unstable_cache(
  async (): Promise<string[]> =>
    (await fetchRows()).filter((r) => r.fields["ReferralFeesAllowed"] === true).map((r) => String(r.fields["BrandId"] ?? "")).filter(Boolean),
  ["realtor-referral-brand-ids"],
  { revalidate: 300, tags: [REFERRAL_BRANDS_CACHE_TAG] }
);

export async function setBrandReferralFeesAllowed(brandId: string, allowed: boolean, brandName: string, updatedBy: string): Promise<void> {
  const fields = { BrandId: brandId, ReferralFeesAllowed: allowed, BrandName: brandName, UpdatedAt: new Date().toISOString(), UpdatedBy: updatedBy };
  const existing = (await fetchRows()).find((r) => r.fields["BrandId"] === brandId);
  const res = existing
    ? await at("", { method: "PATCH", body: JSON.stringify({ records: [{ id: existing.id, fields }] }) })
    : await at("", { method: "POST", body: JSON.stringify({ records: [{ fields }] }) });
  if (!res.ok) throw new Error(await res.text());
  revalidateTag(REFERRAL_BRANDS_CACHE_TAG);
}
