import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getUserByClerkId,
  getStaffMember,
  createTrainingCompletion,
  getAdminStaffEmails,
} from "@/lib/airtable";
import { buildTrainingCertificateEmail } from "@/lib/email";

const AIRTABLE_TYPE: Record<string, string> = {
  harassment: "Harassment Prevention",
  bystander: "Bystander Intervention",
};

const EMAIL_LABEL: Record<string, string> = {
  harassment: "Illinois Harassment Prevention Training",
  bystander: "Chicago Bystander Intervention Training",
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { trainingType, score, totalQuestions, includesChicago } = body as {
    trainingType: string;
    score: number;
    totalQuestions: number;
    includesChicago: boolean;
  };

  if (!trainingType || typeof score !== "number" || typeof totalQuestions !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Resolve user name/email — Users table first, fall back to StaffRoles
  let userName = "Team Member";
  let userEmail = "";

  try {
    const user = await getUserByClerkId(userId);
    if (user) {
      userName = user.name || userName;
      userEmail = user.email || "";
    }
  } catch { /* ignore */ }

  if (!userEmail) {
    try {
      const staff = await getStaffMember(userId);
      if (staff) {
        userName = staff.displayName || userName;
        userEmail = staff.email || "";
      }
    } catch { /* ignore */ }
  }

  const airtableType = AIRTABLE_TYPE[trainingType] ?? trainingType;
  const emailLabel = EMAIL_LABEL[trainingType] ?? trainingType;
  const completedAt = new Date().toISOString();

  // Create Airtable record
  const recordId = await createTrainingCompletion({
    clerkUserId: userId,
    userName,
    userEmail,
    trainingType: airtableType,
    completedAt,
    score,
    includesChicago: !!includesChicago,
  });

  // Send emails (non-blocking on partial failures)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
    const completedDate = new Date(completedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const scoreLabel = `${score}/${totalQuestions} (${Math.round((score / totalQuestions) * 100)}%)`;

    const adminEmails = await getAdminStaffEmails().catch(() => [] as string[]);

    const emailParams = {
      userName,
      userEmail,
      trainingType: emailLabel,
      completedAt: completedDate,
      score: scoreLabel,
      includesChicago: !!includesChicago,
    };

    const sends: Promise<unknown>[] = [];

    if (userEmail) {
      const { subject, html } = buildTrainingCertificateEmail({ ...emailParams, isAdminCopy: false });
      sends.push(resend.emails.send({ from: `Top Tier Transitions <${fromEmail}>`, to: userEmail, subject, html }));
    }

    const { subject: adminSubject, html: adminHtml } = buildTrainingCertificateEmail({ ...emailParams, isAdminCopy: true });
    for (const to of adminEmails.filter(e => e !== userEmail)) {
      sends.push(resend.emails.send({ from: `Top Tier Transitions <${fromEmail}>`, to, subject: adminSubject, html: adminHtml }));
    }

    await Promise.allSettled(sends);
  }

  return NextResponse.json({ success: true, recordId });
}
