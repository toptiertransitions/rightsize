import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getStaffMembers } from "./airtable";
import { isTTTAdmin } from "./config";
import { buildNewUserAdminEmail } from "./email";

export async function getAdminEmails(): Promise<string[]> {
  // 1. Airtable StaffRoles — active TTTAdmin users
  try {
    const staff = await getStaffMembers();
    const emails = staff
      .filter(s => s.isActive && s.email && (s.role === "TTTAdmin" || isTTTAdmin(s.clerkUserId)))
      .map(s => s.email as string);
    if (emails.length > 0) return emails;
  } catch { /* fall through */ }

  // 2. TTT_ADMIN_USER_IDS env var → Clerk lookup
  const adminIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (adminIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const emails: string[] = [];
      for (const id of adminIds) {
        const u = await clerk.users.getUser(id).catch(() => null);
        const email =
          u?.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u?.emailAddresses[0]?.emailAddress;
        if (email) emails.push(email);
      }
      if (emails.length > 0) return emails;
    } catch { /* fall through */ }
  }

  // 3. Hard-coded env var fallback
  return (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
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
