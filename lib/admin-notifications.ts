import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getStaffMembers } from "./airtable";
import { isTTTAdmin } from "./config";
import { buildNewUserAdminEmail } from "./email";

export async function getAdminEmails(): Promise<string[]> {
  const collected = new Set<string>();

  // 1. Airtable StaffRoles — staff whose Clerk ID is in TTT_ADMIN_USER_IDS
  try {
    const staff = await getStaffMembers();
    staff
      .filter(s => s.isActive && s.email && (s.role === "TTTAdmin" || isTTTAdmin(s.clerkUserId)))
      .forEach(s => collected.add((s.email as string).toLowerCase()));
  } catch { /* non-fatal */ }

  // 2. TTT_ADMIN_USER_IDS → Clerk lookup (catches admins with no/incomplete Airtable record)
  const adminIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (adminIds.length > 0) {
    try {
      const clerk = await clerkClient();
      for (const id of adminIds) {
        const u = await clerk.users.getUser(id).catch(() => null);
        const email =
          u?.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u?.emailAddresses[0]?.emailAddress;
        if (email) collected.add(email.toLowerCase());
      }
    } catch { /* non-fatal */ }
  }

  // 3. Hard-coded env var fallback
  (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map(s => s.trim()).filter(Boolean)
    .forEach(e => collected.add(e.toLowerCase()));

  return [...collected];
}

export async function sendNewUserAdminNotification(params: {
  fullName: string;
  email: string;
  imageUrl?: string | null;
  userType: "client" | "staff" | "unknown";
  roleLabel: string;
  projectName?: string | null;
  projectAddress?: string | null;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;

  const createdAt = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const html = buildNewUserAdminEmail({ ...params, createdAt });
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `New User: ${params.fullName} (${params.roleLabel})`,
    html,
  });
}
