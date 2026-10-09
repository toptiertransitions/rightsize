import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getOnboardingState } from "@/lib/onboarding/state";
import { getLocalVendorById } from "@/lib/airtable";
import { emptyWizardData, type WizardData } from "./wizardTypes";
import { OnboardingWizard } from "./OnboardingWizard";
import type { Tenant } from "@/lib/types";
import { getAllBrands } from "@/lib/brands/data";
import { getJoinCookieBrand } from "@/lib/brands/attach";
import { brandCss, type CommunityBrand } from "@/lib/brands/shared";

// The community the user is joining through, if known: the project's brand,
// a code/link already on the account, or a pending join-link cookie.
async function onboardingBrand(tenant: Tenant | null, brandSlug: unknown): Promise<CommunityBrand | null> {
  try {
    const brands = await getAllBrands();
    const active = (b?: CommunityBrand) => (b?.status === "Active" ? b : null);
    return (
      (tenant?.communityBrandId ? active(brands.find((b) => b.id === tenant.communityBrandId)) : null) ??
      (typeof brandSlug === "string" && brandSlug ? active(brands.find((b) => b.slug === brandSlug)) : null) ??
      (await getJoinCookieBrand())
    );
  } catch {
    return null;
  }
}

function BrandStyle({ brand }: { brand: CommunityBrand | null }) {
  return brand ? <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor, brand.secondaryColor) }} /> : null;
}

function tenantToWizardData(tenant: Tenant, firstName: string, lastName: string, destinationCommunityName: string): WizardData {
  const base = emptyWizardData(firstName, lastName, tenant.currentZip ?? "");
  return {
    ...base,
    serviceInterests: tenant.serviceInterests ?? [],
    appOnlyIntent: tenant.appOnlyIntent ?? false,
    timelineType: tenant.timelineType ?? null,
    timelineValue: tenant.timelineValue ?? "",
    destinationType: tenant.destinationType ?? null,
    destinationZip: tenant.destinationZip ?? "",
    destinationCommunity: tenant.destinationCommunity ?? "",
    destinationCommunityName,
    destinationCommunityOther: tenant.destinationCommunityOther ?? "",
    sqftRange: tenant.sqftRange ?? null,
    sqftExact: tenant.sqftExact ?? null,
    homeDensity: tenant.homeDensity ?? null,
    bedrooms: tenant.bedrooms ?? 1,
    bathrooms: tenant.bathrooms ?? 1,
    howHeard: tenant.howHeard ?? "",
    howHeardDetail: tenant.howHeardDetail ?? "",
  };
}

export default async function GetStartedPage() {
  const state = await getOnboardingState();

  if (state.status === "signed_out") redirect("/sign-in");
  if (state.status === "ineligible") redirect("/home");
  if (state.status === "partner") redirect("/partner/home");
  if (state.status === "done") redirect("/home");

  const user = await currentUser().catch(() => null);
  const fallbackFirstName = user?.firstName ?? "";
  const fallbackLastName = user?.lastName ?? "";

  const brand = await onboardingBrand(state.status === "resume" ? state.tenant : null, user?.publicMetadata?.brandSlug);

  if (state.status === "resume") {
    const community = state.tenant.destinationCommunity
      ? await getLocalVendorById(state.tenant.destinationCommunity).catch(() => null)
      : null;
    return (
      <>
        <BrandStyle brand={brand} />
        <OnboardingWizard
          initialStep={Math.max(state.tenant.onboardingCurrentStep ?? 1, 1)}
          initialTenantId={state.tenant.id}
          initialData={tenantToWizardData(state.tenant, fallbackFirstName, fallbackLastName, community?.vendorName ?? "")}
          initialBrandName={brand?.displayName ?? null}
        />
      </>
    );
  }

  return (
    <>
      <BrandStyle brand={brand} />
      <OnboardingWizard
        initialStep={1}
        initialTenantId={null}
        initialData={emptyWizardData(fallbackFirstName, fallbackLastName, "")}
        initialBrandName={brand?.displayName ?? null}
      />
    </>
  );
}
