import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";
import { getComments, addComment, getAuthorEmailForContent } from "@/lib/airtable-content";
import { Resend } from "resend";

interface Context { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: contentId } = await params;
  const comments = await getComments(contentId);
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: contentId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.body?.trim()) return NextResponse.json({ error: "Comment body required" }, { status: 400 });

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const authorName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ")
    || clerkUser?.emailAddresses[0]?.emailAddress || "Staff";
  const authorPhotoUrl = clerkUser?.imageUrl ?? undefined;

  const comment = await addComment({
    contentId,
    authorClerkId: userId,
    authorName,
    authorPhotoUrl,
    body: body.body.trim(),
  });

  // Notify author of content if commenter is different
  notifyContentAuthor({ contentId, commenterName: authorName, commentBody: body.body.trim() }).catch(() => {});

  return NextResponse.json({ comment });
}

async function notifyContentAuthor(params: { contentId: string; commenterName: string; commentBody: string }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const authorEmail = await getAuthorEmailForContent(params.contentId);
  if (!authorEmail) return;
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: authorEmail,
    subject: `New comment on your content`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;color:#111827;">New Comment on Your Content</h2>
        <p style="color:#4B5563;margin:0 0 16px;">
          <strong>${params.commenterName}</strong> left a comment:
        </p>
        <blockquote style="border-left:3px solid #2E6B4F;padding:8px 16px;margin:0 0 16px;color:#374151;font-style:italic;">
          ${params.commentBody}
        </blockquote>
        <p style="margin:0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com"}/crm/outreach?tab=repository" style="color:#2E6B4F;font-weight:600;">View in Content Repository →</a>
        </p>
      </div>`,
  });
}
