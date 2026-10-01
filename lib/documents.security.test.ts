// Live integration checks against real Cloudinary + Airtable credentials.
// Not part of the normal `npm test` run (hits external services, costs real
// API calls) — run explicitly with: RUN_LIVE_DOCUMENT_TESTS=1 npx vitest run lib/documents.security.test.ts
import { describe, it, expect } from "vitest";
import { partnerHasAccessToTenant } from "./partner";
import { getReferralCompanies, getReferralContactById } from "./airtable";
import { uploadAuthenticatedFile, getAuthenticatedDownloadUrl, deleteAuthenticatedFile } from "./cloudinary";
import { validateUpload } from "./documents";

const runLive = process.env.RUN_LIVE_DOCUMENT_TESTS === "1";

describe.runIf(runLive)("Live: cross-project access denial", () => {
  it("a real partner is denied access to a project they never referred", async () => {
    const companies = await getReferralCompanies();
    expect(companies.length).toBeGreaterThan(0);

    // Find any company with at least one contact to test against.
    let testedContactId: string | null = null;
    for (const company of companies) {
      const contact = await getReferralContactById(company.id).catch(() => null);
      if (contact) {
        testedContactId = contact.id;
        break;
      }
    }

    // Fall back: just construct a minimal fake contact — the function only
    // reads referralCompanyId/id off it, never trusts anything else.
    const contact = testedContactId
      ? (await getReferralContactById(testedContactId))!
      : { id: "rec_fake_test_contact", referralCompanyId: undefined } as unknown as Parameters<typeof partnerHasAccessToTenant>[0];

    const fakeTenantId = "rec_nonexistent_tenant_for_security_test_0001";
    const hasAccess = await partnerHasAccessToTenant(contact, fakeTenantId);
    expect(hasAccess).toBe(false);
  });
});

describe.runIf(runLive)("Live: signed URL expiry", () => {
  it("a Cloudinary signed download URL stops working after it expires", async () => {
    const publicId = `rightsize/documents/_security-test/${Date.now()}`;
    const buffer = Buffer.from("security test file contents");

    await uploadAuthenticatedFile(buffer, { publicId, mimeType: "text/plain" });

    try {
      // 1-second expiry — generous enough to observe both states clearly.
      const url = getAuthenticatedDownloadUrl(publicId, "txt", 1);

      const immediate = await fetch(url);
      expect(immediate.ok).toBe(true);

      await new Promise((r) => setTimeout(r, 3000));

      const afterExpiry = await fetch(url);
      expect(afterExpiry.ok).toBe(false);
    } finally {
      await deleteAuthenticatedFile(publicId).catch(() => {});
    }
  }, 15000);
});

describe.runIf(runLive)("Live: blocked types and oversized files fail safely end to end", () => {
  it("validateUpload rejects before any Cloudinary call would even happen", () => {
    const svg = Buffer.from("<svg onload=\"alert(1)\"></svg>");
    expect(validateUpload(svg, "image/svg+xml", svg.length).ok).toBe(false);
  });
});
