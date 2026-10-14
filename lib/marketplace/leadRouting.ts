// Who on a partner company's team gets new-lead alerts. Pure, so the
// portal Team page, the admin Users page and the lead sender all agree.
//
//  "all"       every Active teammate (including people who join later)
//  "selected"  only Active teammates marked NotifyLeads; if nobody is
//              marked, the account owner, so a lead never goes nowhere

export type LeadRouting = "all" | "selected";

interface RoutableUser {
  id: string;
  status: string;
  role: string;
  notifyLeads: boolean;
}

export function leadRecipientIds(routing: LeadRouting, users: RoutableUser[]): { ids: string[]; fellBackToOwner: boolean } {
  const active = users.filter((u) => u.status === "Active");
  if (routing === "all") return { ids: active.map((u) => u.id), fellBackToOwner: false };
  const chosen = active.filter((u) => u.notifyLeads);
  if (chosen.length > 0) return { ids: chosen.map((u) => u.id), fellBackToOwner: false };
  const owner = active.find((u) => u.role === "Primary");
  return { ids: owner ? [owner.id] : active.map((u) => u.id), fellBackToOwner: true };
}
