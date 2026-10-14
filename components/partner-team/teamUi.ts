// Display helpers shared by the partner portal Team page and
// Admin > Marketplace > Users.
import type { PartnerUserView } from "@/lib/marketplace/types";

export function initials(name: string, email: string): string {
  const parts = (name || email).replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function relativeDay(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function inviteExpiresIn(u: PartnerUserView): string {
  if (!u.inviteExpiresAt) return "";
  const days = Math.ceil((new Date(u.inviteExpiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  return days === 1 ? "expires tomorrow" : `expires in ${days} days`;
}

/** Owner first, then joined people A-Z, then pending invites newest first. */
export function sortTeam(list: PartnerUserView[]): PartnerUserView[] {
  const rank = (u: PartnerUserView) => (u.status === "Active" ? (u.role === "Primary" ? 0 : 1) : u.status === "Invited" ? 2 : 3);
  return [...list].sort((a, b) =>
    rank(a) - rank(b) ||
    (a.status === "Invited" ? (b.invitedAt ?? "").localeCompare(a.invitedAt ?? "") : (a.name || a.email).localeCompare(b.name || b.email))
  );
}
