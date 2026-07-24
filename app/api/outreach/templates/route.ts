import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachTemplates,
  createOutreachTemplate,
  updateOutreachTemplate,
  deleteOutreachTemplate,
} from "@/lib/airtable";

async function requireSalesRole(userId: string) {
  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) return null;
  return role;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await getOutreachTemplates(userId);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, channel, subject, body: templateBody, shared, sharedWith, emailType, ctaLink, ctaLabel, attachmentUrl } = body;
  if (!name || !channel) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  try {
    const template = await createOutreachTemplate({
      name,
      channel,
      subject: subject ?? "",
      body: templateBody ?? "",
      ownerClerkId: userId,
      shared: shared ?? false,
      sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
      emailType: emailType ?? "text",
      ctaLink: ctaLink ?? "",
      ctaLabel: ctaLabel ?? "",
      attachmentUrl: attachmentUrl ?? "",
    });
    return NextResponse.json({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outreach/templates POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const template = await updateOutreachTemplate(id, data);
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[outreach/templates PATCH]", err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await deleteOutreachTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[outreach/templates DELETE]", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
