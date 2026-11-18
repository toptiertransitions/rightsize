import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/airtable", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));

import { sendRealtorDisclosureAckAdminNotification } from "@/lib/admin-notifications";
import type { RealtorAckRecord } from "./realtorDisclosureServer";

const record: RealtorAckRecord = {
  ackId: "a1", acknowledgedAt: "2026-11-18T15:00:00.000Z", tenantId: "recTenant", projectName: "Smith Move",
  clientUserId: "user_client", clientName: "Pat Smith", actingUserId: "user_staff", actingUserName: "Sam Staff", actingRole: "TTTManager",
  staffConfirmedClientAgreed: true, understandsCompensation: true, consentsToShareInfo: true,
  disclosureVersion: "v1-draft", disclosureTextSnapshot: "text", disclosureTextSha256: "abc",
  realtors: [{ id: "recR", name: "Jane <Realty>" }], context: "select",
};

describe("sendRealtorDisclosureAckAdminNotification", () => {
  it("emails the TTT Admins with the agreed subject and details", async () => {
    const send = vi.fn(async () => ({ error: null }));
    await sendRealtorDisclosureAckAdminNotification(record, { send, adminEmails: async () => ["admin@ttt.com", "ops@ttt.com"] });
    const msg = (send.mock.calls[0] as unknown as [{ to: string[]; subject: string; html: string }])[0];
    expect(msg.to).toEqual(["admin@ttt.com", "ops@ttt.com"]);
    expect(msg.subject).toBe("Realtor referral disclosure acknowledged: Pat Smith / Smith Move");
    for (const s of ["Pat Smith", "Smith Move", "Jane &lt;Realty&gt;", "v1-draft", "Sam Staff", "TTTManager", "/partners?tenantId=recTenant", "I have read and understand", "I agree to Top Tier Transitions sharing"]) {
      expect(msg.html).toContain(s);
    }
    // Name and project only: no contact details or snapshot text
    expect(msg.html).not.toContain("user_client");
  });

  it("sends nothing when there are no admin recipients", async () => {
    const send = vi.fn();
    await sendRealtorDisclosureAckAdminNotification(record, { send, adminEmails: async () => [] });
    expect(send).not.toHaveBeenCalled();
  });

  it("surfaces a send failure to the caller (which logs it and carries on)", async () => {
    await expect(
      sendRealtorDisclosureAckAdminNotification(record, { send: async () => ({ error: { message: "rate limited" } }), adminEmails: async () => ["a@b.c"] })
    ).rejects.toThrow("rate limited");
  });
});
