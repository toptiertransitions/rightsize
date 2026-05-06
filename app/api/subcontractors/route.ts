import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
} from "@/lib/airtable";
import { buildSubcontractorAddedEmail } from "@/lib/email";

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"];

// ─── GET: fetch all subcontractors ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subcontractors = await getSubcontractors().catch(() => []);
  return NextResponse.json({ subcontractors });
}

// ─── POST: create subcontractor + notify all TTTAdmins ────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, charges, scope, paid, paidDate, tenantId, tenantName, fileUrl, filePublicId } = body;

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const subcontractor = await createSubcontractor({
    name,
    charges: Number(charges) || 0,
    scope: scope || "",
    paid: paid ?? false,
    paidDate: paidDate || undefined,
    tenantId: tenantId || undefined,
    tenantName: tenantName || undefined,
    fileUrl: fileUrl || undefined,
    filePublicId: filePublicId || undefined,
  });

  // Notify all TTTAdmins by email (non-blocking)
  notifyAdmins({
    userId,
    subName: name,
    charges: Number(charges) || 0,
    scope: scope || "",
    tenantName: tenantName || "",
    fileUrl: fileUrl || "",
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  }).catch((e) => console.error("[subcontractors] admin notify failed:", e));

  return NextResponse.json({ subcontractor });
}

async function notifyAdmins(opts: {
  userId: string;
  subName: string;
  charges: number;
  scope: string;
  tenantName: string;
  fileUrl: string;
  date: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  if (!resendKey) return;

  // Get the name of the person who added the entry
  const adder = await currentUser().catch(() => null);
  const addedByName =
    [adder?.firstName, adder?.lastName].filter(Boolean).join(" ") ||
    adder?.emailAddresses?.[0]?.emailAddress ||
    "A team member";

  // Look up all TTTAdmin emails via Clerk
  const adminIds = (process.env.TTT_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!adminIds.length) return;

  const clerk = await clerkClient();
  const adminEmails: string[] = (
    await Promise.all(
      adminIds.map((id) =>
        clerk.users.getUser(id)
          .then((u) => u.emailAddresses?.[0]?.emailAddress ?? "")
          .catch(() => "")
      )
    )
  ).filter(Boolean);

  if (!adminEmails.length) return;

  const resend = new Resend(resendKey);
  const html = buildSubcontractorAddedEmail({
    addedByName,
    subName: opts.subName,
    charges: opts.charges,
    project: opts.tenantName || undefined,
    scope: opts.scope || undefined,
    date: opts.date,
    fileUrl: opts.fileUrl || undefined,
    appUrl,
  });

  await Promise.all(
    adminEmails.map((to) =>
      resend.emails.send({
        from: `Top Tier Transitions <${fromEmail}>`,
        to,
        subject: `New subcontractor added: ${opts.subName}${opts.tenantName ? ` · ${opts.tenantName}` : ""}`,
        html,
      })
    )
  );
}

// ─── PATCH: update subcontractor ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const subcontractor = await updateSubcontractor(id, {
    name: data.name,
    charges: data.charges !== undefined ? Number(data.charges) : undefined,
    scope: data.scope,
    paid: data.paid,
    paidDate: data.paidDate !== undefined ? (data.paidDate || null) : undefined,
    tenantId: data.tenantId !== undefined ? (data.tenantId || null) : undefined,
    tenantName: data.tenantName !== undefined ? (data.tenantName || null) : undefined,
    fileUrl: data.fileUrl !== undefined ? (data.fileUrl || null) : undefined,
    filePublicId: data.filePublicId !== undefined ? (data.filePublicId || null) : undefined,
  });

  return NextResponse.json({ subcontractor });
}

// ─── DELETE: remove subcontractor ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteSubcontractor(id);
  return NextResponse.json({ ok: true });
}
