// Realtor referral disclosure gate in the Partner page actions: flag off
// changes nothing, flag on gates Realtor only, and every other category
// behaves exactly as before.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_CATEGORIES } from "@/lib/types";

const h = vi.hoisted(() => ({
  flag: false,
  brandId: undefined as string | undefined,
  brandAllowed: false,
  ackResult: null as string | null,
  acknowledge: vi.fn(),
  upsert: vi.fn(),
  addIntro: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_client" }), currentUser: async () => null }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/airtable", () => ({
  getSystemRole: async () => null,
  getUserRoleForTenant: async () => "Owner",
  getTenantById: async () => ({ id: "recTenant", name: "Smith Move", communityBrandId: h.brandId }),
  getPartnerSelectionsForTenant: async () => [],
  upsertPartnerSelection: (...a: unknown[]) => h.upsert(...a),
  getPartnerRequestsForTenant: async () => [],
  addPartnerIntroRequest: (...a: unknown[]) => h.addIntro(...a),
}));
vi.mock("@/lib/partners/queries", () => ({
  getPartnerDirectory: async () => PARTNER_CATEGORIES.map((c) => ({ id: `rec-${c}`, vendorName: `${c} Co`, category: c })),
}));
vi.mock("@/lib/demo", () => ({ isDemoTenant: () => true })); // stop intro requests before any email/CRM work
vi.mock("@/lib/marketplace/leads", () => ({}));
vi.mock("@/lib/partners/analytics", () => ({ logPartnerMatchEvent: vi.fn() }));
vi.mock("@/lib/admin-notifications", () => ({}));
vi.mock("@/lib/marketplace/data", () => ({}));
vi.mock("@/lib/partners/rehomingServer", () => ({}));
vi.mock("@/lib/partners/realtorDisclosureServer", () => ({
  isRealtorDisclosureEnabled: () => h.flag,
  isRealtorDisclosureActive: async (_u: string, t: { communityBrandId?: string }) => h.flag && (!t.communityBrandId || h.brandAllowed),
  acknowledgeRealtorDisclosure: async (p: unknown) => { h.acknowledge(p); return h.ackResult; },
}));

import { selectPartnerAction, requestPartnerIntroAction } from "./actions";

const ack = { version: "v1-draft", understandsCompensation: true, consentsToShareInfo: true };

beforeEach(() => {
  h.flag = false;
  h.brandId = undefined;
  h.brandAllowed = false;
  h.ackResult = null;
  h.acknowledge.mockReset();
  h.upsert.mockReset().mockResolvedValue(undefined);
  h.addIntro.mockReset().mockResolvedValue(undefined);
});

describe("flag off: nothing changes", () => {
  it("selects every category, Realtor included, with no acknowledgment", async () => {
    for (const c of PARTNER_CATEGORIES) {
      expect(await selectPartnerAction("recTenant", c, `rec-${c}`)).toEqual({ ok: true });
    }
    expect(h.upsert).toHaveBeenCalledTimes(PARTNER_CATEGORIES.length);
    expect(h.acknowledge).not.toHaveBeenCalled();
  });
  it("requests a realtor intro with no acknowledgment", async () => {
    expect(await requestPartnerIntroAction("recTenant", "Realtor", "rec-Realtor")).toEqual({ ok: true });
    expect(h.addIntro).toHaveBeenCalledTimes(1);
    expect(h.acknowledge).not.toHaveBeenCalled();
  });
});

describe("flag on", () => {
  beforeEach(() => { h.flag = true; });

  it("other categories behave exactly as before", async () => {
    for (const c of PARTNER_CATEGORIES.filter((c) => c !== "Realtor")) {
      expect(await selectPartnerAction("recTenant", c, `rec-${c}`)).toEqual({ ok: true });
      expect(await requestPartnerIntroAction("recTenant", c, `rec-${c}`)).toEqual({ ok: true });
    }
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("blocks a realtor selection without a valid acknowledgment", async () => {
    h.ackResult = "Please check both boxes to continue.";
    expect(await selectPartnerAction("recTenant", "Realtor", "rec-Realtor")).toEqual({ ok: false, error: "Please check both boxes to continue." });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("records the acknowledgment before selecting the realtor", async () => {
    expect(await selectPartnerAction("recTenant", "Realtor", "rec-Realtor", ack)).toEqual({ ok: true });
    expect(h.acknowledge).toHaveBeenCalledWith(expect.objectContaining({
      ack, actingUserId: "user_client", staffRole: null, context: "select",
      tenant: { id: "recTenant", name: "Smith Move" }, realtors: [{ id: "rec-Realtor", name: "Realtor Co" }],
    }));
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("co-branded project, community toggle off (default): realtor match goes through with no disclosure or record", async () => {
    h.brandId = "recBrandA";
    expect(await selectPartnerAction("recTenant", "Realtor", "rec-Realtor")).toEqual({ ok: true });
    expect(await requestPartnerIntroAction("recTenant", "Realtor", "rec-Realtor")).toEqual({ ok: true });
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("co-branded project, community toggle on: realtor matches are gated", async () => {
    h.brandId = "recBrandA";
    h.brandAllowed = true;
    h.ackResult = "Please check both boxes to continue.";
    expect((await selectPartnerAction("recTenant", "Realtor", "rec-Realtor")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("gates realtor intro requests the same way", async () => {
    h.ackResult = "Please check both boxes to continue.";
    expect((await requestPartnerIntroAction("recTenant", "Realtor", "rec-Realtor", true, ack)).ok).toBe(false);
    expect(h.addIntro).not.toHaveBeenCalled();

    h.ackResult = null;
    expect(await requestPartnerIntroAction("recTenant", "Realtor", "rec-Realtor", true, ack)).toEqual({ ok: true });
    expect(h.acknowledge).toHaveBeenLastCalledWith(expect.objectContaining({ context: "intro_request", sendEmail: false }));
    expect(h.addIntro).toHaveBeenCalledTimes(1);
  });
});
