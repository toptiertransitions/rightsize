// 5-star Google reviews become branded "Five-Star Client Story" PDFs in the
// Outreach Content repository, exactly as if a Manager/Admin had uploaded
// them: the PDF is stored in Cloudinary, a ContentItem is created in the
// Reviews/Testimonials category with an AI thumbnail icon, and the usual
// "New Marketing Content Alert" email goes out with the PDF attached.
// Server-only.
import "server-only";
import { getTenantById, getOpportunitiesForTenant, getClientContactById } from "@/lib/airtable";
import { createContentItem, getContentCategories } from "@/lib/airtable-content";
import { uploadFile } from "@/lib/cloudinary";
import { generateContentIcon } from "@/lib/content-icon";
import { notifyTeamNewContent } from "@/lib/content-team-notify";
import type { ContentItem } from "@/lib/types";
import { renderReviewPdf } from "./pdf";
import { clientTypeFor, firstNameLastInitial, townLabel, type ReviewCollateralDetails } from "./shared";

export { COLLATERAL_MIN_STARS, CLIENT_TYPE_OPTIONS, parseCollateralDetails, type ReviewCollateralDetails } from "./shared";

/** Prefills for the review form: the CRM client contact's name, client type and origin town. */
export async function getReviewCollateralDefaults(tenantId: string): Promise<ReviewCollateralDetails> {
  const [tenant, opportunities] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getOpportunitiesForTenant(tenantId).catch(() => []),
  ]);
  const opp = opportunities.find((o) => o.stage === "Won") ?? opportunities[0] ?? null;
  const contact = opp?.clientContactId ? await getClientContactById(opp.clientContactId).catch(() => null) : null;
  return {
    displayName: contact?.name ? firstNameLastInitial(contact.name) : "",
    clientType: tenant ? clientTypeFor(tenant) : "Relocation Client",
    town: townLabel(tenant?.city, tenant?.state),
  };
}

/**
 * Makes the PDF and adds it to the Content repository as an Active item
 * authored by the person who saved the review, then sends the team alert.
 */
export async function publishReviewCollateral(input: {
  stars: number;
  text: string;
  details: ReviewCollateralDetails;
  authorClerkId: string;
}): Promise<ContentItem> {
  const { details } = input;
  const pdf = await renderReviewPdf({ stars: input.stars, text: input.text, ...details });

  const fileStem = `Top-Tier-5-Star-Review-${details.displayName.replace(/\./g, "").trim().replace(/\s+/g, "-")}`;
  const [upload, categories] = await Promise.all([
    uploadFile(pdf, { folder: "rightsize/content/files", mimeType: "application/pdf", resourceType: "raw", originalFileName: `${fileStem}.pdf` }),
    getContentCategories().catch(() => []),
  ]);
  const category = categories.find((c) => /review|testimonial/i.test(c.name));

  const title = `New 5 Star Google Review - ${details.displayName}`;
  const description = [details.clientType, details.town].filter(Boolean).join(" · ") || "Google Review";
  const icon = await generateContentIcon({ title, description, contentType: "PDF", audience: "Both" }).catch((e) => {
    console.error("[review-collateral] icon failed, saving without one:", e);
    return null;
  });

  const item = await createContentItem({
    title,
    description,
    contentType: "PDF",
    fileUrl: upload.secureUrl,
    filePublicId: upload.publicId,
    thumbnailUrl: icon?.thumbnailUrl,
    thumbnailPublicId: icon?.thumbnailPublicId,
    audience: "Both",
    pipelineStage: "All",
    categoryId: category?.id,
    tags: ["review"],
    authorClerkId: input.authorClerkId,
    status: "Active",
    sharedWith: [],
  });

  await notifyTeamNewContent(item);
  return item;
}
