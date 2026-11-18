import { describe, it, expect } from "vitest";
import { PARTNER_CATEGORIES } from "@/lib/types";
import {
  REALTOR_DISCLOSURE, canSubmitRealtorAck, disclosureSnapshot, realtorAckError, realtorAckRequired, realtorDisclosureAppliesToTenant, type RealtorAckInput,
} from "./realtorDisclosure";

const ack = (o: Partial<RealtorAckInput> = {}): RealtorAckInput => ({
  version: REALTOR_DISCLOSURE.version, understandsCompensation: true, consentsToShareInfo: true, ...o,
});

describe("realtor disclosure config", () => {
  it("starts at v1-draft with the agreed wording", () => {
    expect(REALTOR_DISCLOSURE.version).toBe("v1-draft");
    expect(REALTOR_DISCLOSURE.heading).toBe("How we're compensated for realtor introductions");
    expect(REALTOR_DISCLOSURE.body).toHaveLength(3);
    expect(REALTOR_DISCLOSURE.body[0]).toContain("License No. 475.220834");
    expect(REALTOR_DISCLOSURE.body[0]).toContain("License No. 478.008549");
    expect(REALTOR_DISCLOSURE.short).toContain("License No. 475.220834, sponsored by NIREIN");
    expect(REALTOR_DISCLOSURE.checkboxCompensation).toBe("I have read and understand how Top Tier Transitions may be compensated for introducing me to a realtor.");
    expect(REALTOR_DISCLOSURE.checkboxShareInfo).toBe("I agree to Top Tier Transitions sharing my contact information and details about my situation with the realtor(s) I select so they can contact me.");
  });

  it("snapshots exactly the heading and body shown", () => {
    expect(disclosureSnapshot()).toBe([REALTOR_DISCLOSURE.heading, ...REALTOR_DISCLOSURE.body].join("\n\n"));
  });
});

describe("realtorAckRequired (regression: only Realtor, only with the flag on)", () => {
  it("is never required with the flag off", () => {
    for (const c of PARTNER_CATEGORIES) expect(realtorAckRequired(c, false)).toBe(false);
  });
  it("is required for Realtor only with the flag on", () => {
    for (const c of PARTNER_CATEGORIES) expect(realtorAckRequired(c, true)).toBe(c === "Realtor");
  });
});

describe("co-branded projects", () => {
  it("applies to projects with no community brand", () => {
    expect(realtorDisclosureAppliesToTenant(undefined, new Set())).toBe(true);
    expect(realtorDisclosureAppliesToTenant("", new Set())).toBe(true);
  });
  it("is off for a co-branded project unless its community allows referral fees", () => {
    expect(realtorDisclosureAppliesToTenant("recBrandA", new Set())).toBe(false);
    expect(realtorDisclosureAppliesToTenant("recBrandA", new Set(["recBrandB"]))).toBe(false);
    expect(realtorDisclosureAppliesToTenant("recBrandA", new Set(["recBrandA"]))).toBe(true);
  });
});

describe("checkbox gating", () => {
  it("client needs both boxes", () => {
    expect(canSubmitRealtorAck(null, false)).toBe(false);
    expect(canSubmitRealtorAck(ack({ understandsCompensation: false }), false)).toBe(false);
    expect(canSubmitRealtorAck(ack({ consentsToShareInfo: false }), false)).toBe(false);
    expect(canSubmitRealtorAck(ack(), false)).toBe(true);
  });
  it("staff also needs the client-agreed confirmation", () => {
    expect(canSubmitRealtorAck(ack(), true)).toBe(false);
    expect(canSubmitRealtorAck(ack({ staffConfirmedClientAgreed: true }), true)).toBe(true);
    expect(canSubmitRealtorAck(ack({ staffConfirmedClientAgreed: true, consentsToShareInfo: false }), true)).toBe(false);
  });
  it("server rejects a missing, incomplete or stale acknowledgment", () => {
    expect(realtorAckError(undefined, false)).toMatch(/check both boxes/);
    expect(realtorAckError(ack({ consentsToShareInfo: false }), false)).toMatch(/both boxes/);
    expect(realtorAckError(ack({ version: "v0" }), false)).toMatch(/updated/);
    expect(realtorAckError(ack(), true)).toMatch(/confirm the client/);
    expect(realtorAckError(ack(), false)).toBeNull();
  });
});
