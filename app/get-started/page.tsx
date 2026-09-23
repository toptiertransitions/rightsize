import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getOnboardingState } from "@/lib/onboarding/state";
import { getReferralCompanyById } from "@/lib/airtable";
import { emptyWizardData, type WizardData } from "./wizardTypes";
import { OnboardingWizard } from "./OnboardingWizard";
import type { Tenant } from "@/lib/types";

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
  };
}

export default async function GetStartedPage() {
  const state = await getOnboardingState();

  if (state.status === "signed_out") redirect("/sign-in");
  if (state.status === "ineligible") redirect("/home");
  if (state.status === "done") redirect("/home");

  const user = await currentUser().catch(() => null);
  const fallbackFirstName = user?.firstName ?? "";
  const fallbackLastName = user?.lastName ?? "";

  if (state.status === "resume") {
    const community = state.tenant.destinationCommunity
      ? await getReferralCompanyById(state.tenant.destinationCommunity).catch(() => null)
      : null;
    return (
      <OnboardingWizard
        initialStep={Math.max(state.tenant.onboardingCurrentStep ?? 1, 1)}
        initialTenantId={state.tenant.id}
        initialData={tenantToWizardData(state.tenant, fallbackFirstName, fallbackLastName, community?.name ?? "")}
      />
    );
  }

  return (
    <OnboardingWizard
      initialStep={1}
      initialTenantId={null}
      initialData={emptyWizardData(fallbackFirstName, fallbackLastName, "")}
    />
  );
}
