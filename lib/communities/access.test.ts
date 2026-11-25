import { describe, it, expect, vi, beforeEach } from "vitest";

let role: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: role === null ? null : "user_1" }),
  clerkClient: async () => ({ users: { getUser: async () => ({ firstName: "Pat", lastName: "Lee", emailAddresses: [], primaryEmailAddressId: "" }) } }),
}));
vi.mock("@/lib/airtable", () => ({
  getSystemRole: async () => role,
  getStaffMember: async () => ({ displayName: "Pat Lee", email: "pat@example.com" }),
}));

const { requireCommunityAccess } = await import("./access");
const status = async (need: "view" | "edit" | "archive") => {
  const r = await requireCommunityAccess(need);
  return "status" in r ? (r as Response).status : 200;
};

describe("community role gating", () => {
  beforeEach(() => { role = null; });
  it("needs a signed-in user", async () => { expect(await status("view")).toBe(401); });
  it("keeps roles without Ops out", async () => {
    for (const r of ["TTTStaff", "TTTTeamLead", "", "Owner"]) {
      role = r;
      expect(await status("view")).toBe(403);
    }
  });
  it("lets Sales view but not edit or archive", async () => {
    role = "TTTSales";
    expect(await status("view")).toBe(200);
    expect(await status("edit")).toBe(403);
    expect(await status("archive")).toBe(403);
  });
  it("lets Managers and Admins do everything", async () => {
    for (const r of ["TTTManager", "TTTAdmin"]) {
      role = r;
      expect(await status("edit")).toBe(200);
      expect(await status("archive")).toBe(200);
    }
    const actor = await requireCommunityAccess("edit");
    expect((actor as { name: string }).name).toBe("Pat Lee (pat@example.com)");
  });
});
