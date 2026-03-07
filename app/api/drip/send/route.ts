import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getDripCampaignById,
  getDripEnrollments,
  updateDripEnrollment,
  getDripSettings,
} from "@/lib/airtable";
import { buildDripEmail, substituteVars } from "@/lib/email";

const ALLOWED = ["TTTManager", "TTTSales", "TTTAdmin"];

async function authorize() {
  const { userId } = await auth();
  if (!userId) return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role)) return { userId: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId, role, error: null };
}

/**
 * POST /api/drip/send
 *
 * Two modes:
 * 1. Single step: { enrollmentId, stepIndex, senderEmail, senderName }
 *    - Sends one campaign step to a single enrollment
 *    - Updates currentStep + lastSentAt on enrollment
 *
 * 2. Mass email: { recipients: [{email, name, company}], subject, bodyHtml, senderEmail, senderName }
 *    - Sends one-off email to many recipients
 *    - No enrollment update needed
 */
export async function POST(req: NextRequest) {
  const { userId, error } = await authorize();
  if (error) return error;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  const resend = new Resend(resendKey);

  const body = await req.json();
  const settings = await getDripSettings().catch(() => null);

  // ── Mass Email Mode ────────────────────────────────────────────────────────
  if (body.mode === "mass") {
    const { recipients, subject, bodyHtml, senderName, senderEmail } = body as {
      recipients: { email: string; name: string; company?: string }[];
      subject: string;
      bodyHtml: string;
      senderName: string;
      senderEmail: string;
    };

    if (!recipients?.length || !subject || !bodyHtml) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fromAddress = `${senderName} <${senderEmail}>`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";

    const results = await Promise.allSettled(
      recipients.map(async (r) => {
        const vars: Record<string, string> = {
          first_name: r.name?.split(" ")[0] || r.name || "",
          full_name: r.name || "",
          company: r.company || "",
          sender_name: senderName,
          sender_email: senderEmail,
        };

        const resolvedSubject = substituteVars(subject, vars);
        const unsubUrl = `${baseUrl}/api/drip/unsubscribe?id=mass_${encodeURIComponent(r.email)}`;

        const html = buildDripEmail({
          settings: {
            senderName,
            companyName: settings?.companyName || "Top Tier Transitions",
            companyTagline: settings?.companyTagline || "",
            companyAddress: settings?.companyAddress || "",
            primaryColor: settings?.primaryColor || "#2E6B4F",
            logoUrl: settings?.logoUrl || "",
            signatureHtml: settings?.signatureHtml || "",
          },
          bodyHtml,
          subject: resolvedSubject,
          unsubscribeUrl: unsubUrl,
          vars,
        });

        await resend.emails.send({
          from: fromAddress,
          to: r.email,
          subject: resolvedSubject,
          html,
        });

        return r.email;
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    return NextResponse.json({ sent, failed });
  }

  // ── Single Enrollment Step Mode ────────────────────────────────────────────
  const { enrollmentId, stepIndex, senderName, senderEmail } = body as {
    enrollmentId: string;
    stepIndex: number;
    senderName: string;
    senderEmail: string;
  };

  if (!enrollmentId || stepIndex === undefined) {
    return NextResponse.json({ error: "Missing enrollmentId or stepIndex" }, { status: 400 });
  }

  // Fetch all enrollments and find the one we need
  const allEnrollments = await getDripEnrollments();
  const enrollment = allEnrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if (enrollment.status !== "Active") {
    return NextResponse.json({ error: "Enrollment is not active" }, { status: 400 });
  }

  const campaign = await getDripCampaignById(enrollment.campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const step = campaign.steps[stepIndex];
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  const vars: Record<string, string> = {
    first_name: enrollment.contactName?.split(" ")[0] || enrollment.contactName || "",
    full_name: enrollment.contactName || "",
    company: enrollment.company || "",
    sender_name: senderName,
    sender_email: senderEmail,
  };

  const resolvedSubject = substituteVars(step.subject, vars);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";
  const unsubUrl = `${baseUrl}/api/drip/unsubscribe?id=${enrollment.id}`;

  const html = buildDripEmail({
    settings: {
      senderName,
      companyName: settings?.companyName || "Top Tier Transitions",
      companyTagline: settings?.companyTagline || "",
      companyAddress: settings?.companyAddress || "",
      primaryColor: settings?.primaryColor || "#2E6B4F",
      logoUrl: settings?.logoUrl || "",
      signatureHtml: settings?.signatureHtml || "",
    },
    bodyHtml: step.bodyHtml,
    subject: resolvedSubject,
    unsubscribeUrl: unsubUrl,
    vars,
  });

  const fromAddress = `${senderName} <${senderEmail}>`;
  const { error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: enrollment.contactEmail,
    subject: resolvedSubject,
    html,
  });

  if (sendError) {
    return NextResponse.json({ error: String(sendError) }, { status: 500 });
  }

  // Advance the step
  const nextStep = stepIndex + 1;
  const isComplete = nextStep >= campaign.steps.length;
  const updated = await updateDripEnrollment(enrollment.id, {
    currentStep: nextStep,
    lastSentAt: new Date().toISOString(),
    ...(isComplete ? { status: "Completed" } : {}),
  });

  return NextResponse.json({ enrollment: updated, isComplete });
}
