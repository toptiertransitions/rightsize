import { notFound } from "next/navigation";
import { getIntroductionEventByToken, updateIntroductionEventStatus } from "@/lib/marketplace/data";
import { LeadClient } from "./LeadClient";

export const dynamic = "force-dynamic";

export default async function PartnerLeadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await getIntroductionEventByToken(token);
  if (!event) notFound();

  // First view stamps ViewedAt and flips Requested/Delivered -> Viewed —
  // this page load itself is the tracking signal, not a separate click.
  if (event.status === "Requested" || event.status === "Delivered") {
    await updateIntroductionEventStatus(event.id, "Viewed", { viewedAt: new Date().toISOString() }).catch(() => {});
  }

  return (
    <LeadClient
      token={token}
      clientName={event.clientName}
      clientEmail={event.clientEmail}
      clientPhone={event.clientPhone}
      categoryAnswers={event.categoryAnswersSnapshot}
      status={event.status === "Requested" || event.status === "Delivered" ? "Viewed" : event.status}
    />
  );
}
