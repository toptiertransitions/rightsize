import { describe, it, expect, vi, beforeEach } from "vitest";

const getMembershipsForTenant = vi.fn();
vi.mock("@/lib/airtable", () => ({ getMembershipsForTenant: (...a: unknown[]) => getMembershipsForTenant(...a) }));
vi.mock("@/lib/admin-notifications", () => ({ sendRealtorDisclosureAckAdminNotification: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { getUser: async (id: string) => ({ firstName: id === "user_owner" ? "Olive" : "Sam", lastName: id === "user_owner" ? "Owner" : "Staff", emailAddresses: [] }) },
  }),
}));

import { acknowledgeRealtorDisclosure, createRealtorAckRecord, isRealtorDisclosureEnabled, type RealtorAckRecord } from "./realtorDisclosureServer";
import { REALTOR_DISCLOSURE, disclosureSnapshot } from "./realtorDisclosure";

const goodAck = { version: REALTOR_DISCLOSURE.version, understandsCompensation: true, consentsToShareInfo: true };
const base = {
  actingUserId: "user_client",
  staffRole: null,
  tenant: { id: "recTenant", name: "Smith Move" },
  realtors: [{ id: "recRealtor", name: "Jane Realty" }],
  context: "select" as const,
};

describe("feature flag", () => {
  it("is off by default and for unknown values", () => {
    expect(isRealtorDisclosureEnabled("user_x", {})).toBe(false);
    expect(isRealtorDisclosureEnabled("user_x", { REALTOR_DISCLOSURE_FLAG: "yes" })).toBe(false);
    expect(isRealtorDisclosureEnabled(null, { REALTOR_DISCLOSURE_FLAG: "on" })).toBe(true);
  });
  it("test mode only reaches allow-listed users", () => {
    const env = { REALTOR_DISCLOSURE_FLAG: "test", REALTOR_DISCLOSURE_TEST_USER_IDS: "user_a, user_b" };
    expect(isRealtorDisclosureEnabled("user_b", env)).toBe(true);
    expect(isRealtorDisclosureEnabled("user_c", env)).toBe(false);
    expect(isRealtorDisclosureEnabled(null, env)).toBe(false);
  });
});

describe("createRealtorAckRecord", () => {
  it("creates (POST only) a record with every required field", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "recAck" }), { status: 200 }));
    const r: RealtorAckRecord = {
      ackId: "a1", acknowledgedAt: "2026-11-18T15:00:00.000Z", tenantId: "recTenant", projectName: "Smith Move",
      clientUserId: "user_client", clientName: "Pat Smith", actingUserId: "user_client", actingUserName: "Pat Smith", actingRole: "Client",
      staffConfirmedClientAgreed: false, understandsCompensation: true, consentsToShareInfo: true,
      disclosureVersion: "v1-draft", disclosureTextSnapshot: disclosureSnapshot(), disclosureTextSha256: "abc",
      realtors: [{ id: "recR1", name: "Jane Realty" }, { id: "recR2", name: "Bob Homes" }], context: "intro_request",
    };
    await expect(createRealtorAckRecord(r, fetchImpl as unknown as typeof fetch)).resolves.toBe("recAck");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("RealtorDisclosureAcks");
    expect(init.method).toBe("POST");
    const f = JSON.parse(init.body as string).fields;
    expect(f).toMatchObject({
      TenantId: "recTenant", ClientUserId: "user_client", ActingUserId: "user_client", AcknowledgedAt: r.acknowledgedAt,
      DisclosureVersion: "v1-draft", DisclosureTextSnapshot: disclosureSnapshot(), UnderstandsCompensation: true, ConsentsToShareInfo: true,
      Checkbox1Label: REALTOR_DISCLOSURE.checkboxCompensation, Checkbox2Label: REALTOR_DISCLOSURE.checkboxShareInfo,
      RealtorIds: "recR1, recR2", RealtorNames: "Jane Realty, Bob Homes", Context: "intro_request",
    });
  });
  it("throws when Airtable rejects the write", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 422 }));
    await expect(createRealtorAckRecord({ realtors: [] } as unknown as RealtorAckRecord, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/422/);
  });
});

describe("acknowledgeRealtorDisclosure", () => {
  beforeEach(() => getMembershipsForTenant.mockReset());

  it("records nothing and returns an error without both boxes", async () => {
    const createRecord = vi.fn();
    const notify = vi.fn();
    const err = await acknowledgeRealtorDisclosure({ ...base, ack: { ...goodAck, consentsToShareInfo: false } }, { createRecord, notify });
    expect(err).toMatch(/both boxes/);
    expect(createRecord).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("records the acknowledgment, then emails the admins", async () => {
    const createRecord = vi.fn(async () => "recAck");
    const notify = vi.fn(async () => {});
    expect(await acknowledgeRealtorDisclosure({ ...base, ack: goodAck }, { createRecord, notify })).toBeNull();
    const rec = (createRecord.mock.calls[0] as unknown as [RealtorAckRecord])[0];
    expect(rec).toMatchObject({
      tenantId: "recTenant", projectName: "Smith Move", clientUserId: "user_client", actingUserId: "user_client", actingRole: "Client",
      disclosureVersion: "v1-draft", disclosureTextSnapshot: disclosureSnapshot(), understandsCompensation: true, consentsToShareInfo: true,
      staffConfirmedClientAgreed: false, realtors: [{ id: "recRealtor", name: "Jane Realty" }], context: "select",
    });
    expect(rec.disclosureTextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(rec.acknowledgedAt)).not.toBeNaN();
    expect(notify).toHaveBeenCalledWith(rec);
  });

  it("staff must confirm for the client; the record names the owner and the staff user", async () => {
    getMembershipsForTenant.mockResolvedValue([{ role: "Owner", userId: "user_owner" }]);
    const createRecord = vi.fn(async () => "recAck");
    const params = { ...base, actingUserId: "user_staff", staffRole: "TTTManager" };
    expect(await acknowledgeRealtorDisclosure({ ...params, ack: goodAck }, { createRecord, notify: vi.fn(async () => {}) })).toMatch(/confirm the client/);
    expect(createRecord).not.toHaveBeenCalled();

    expect(await acknowledgeRealtorDisclosure({ ...params, ack: { ...goodAck, staffConfirmedClientAgreed: true } }, { createRecord, notify: vi.fn(async () => {}) })).toBeNull();
    const rec = (createRecord.mock.calls[0] as unknown as [RealtorAckRecord])[0];
    expect(rec).toMatchObject({ clientUserId: "user_owner", clientName: "Olive Owner", actingUserId: "user_staff", actingUserName: "Sam Staff", actingRole: "TTTManager", staffConfirmedClientAgreed: true });
  });

  it("blocks the match when the record can't be saved", async () => {
    const notify = vi.fn();
    const err = await acknowledgeRealtorDisclosure({ ...base, ack: goodAck }, { createRecord: vi.fn(async () => { throw new Error("down"); }), notify });
    expect(err).toMatch(/couldn't save/i);
    expect(notify).not.toHaveBeenCalled();
  });

  it("an email failure is logged and never blocks the client", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await acknowledgeRealtorDisclosure({ ...base, ack: goodAck }, { createRecord: vi.fn(async () => "recAck"), notify: vi.fn(async () => { throw new Error("smtp"); }) });
    expect(err).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(logged).toHaveBeenCalledWith("[realtor-disclosure] admin email failed:", expect.any(Error));
    logged.mockRestore();
  });

  it("skips the email when asked (demo projects)", async () => {
    const notify = vi.fn();
    await acknowledgeRealtorDisclosure({ ...base, ack: goodAck, sendEmail: false }, { createRecord: vi.fn(async () => "recAck"), notify });
    expect(notify).not.toHaveBeenCalled();
  });
});
