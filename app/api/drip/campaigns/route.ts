import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getDripCampaigns, getDripCampaignById, createDripCampaign, updateDripCampaign, deleteDripCampaign } from "@/lib/airtable";

const ALLOWED = ["TTTManager", "TTTSales", "TTTAdmin"];

async function authorize(req?: NextRequest) {
  const { userId } = await auth();
  if (!userId) return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role)) return { userId: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId, role, error: null };
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  const campaigns = await getDripCampaigns().catch(() => []);
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const { error } = await authorize(req);
  if (error) return error;
  const body = await req.json();
  const campaign = await createDripCampaign({
    name: body.name ?? "Untitled Campaign",
    description: body.description ?? "",
    audience: body.audience ?? "Both",
    tags: body.tags ?? [],
    steps: body.steps ?? [],
    isActive: body.isActive ?? true,
  });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest) {
  const { error } = await authorize(req);
  if (error) return error;
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const campaign = await updateDripCampaign(id, data);
  return NextResponse.json({ campaign });
}

export async function DELETE(req: NextRequest) {
  const { error } = await authorize(req);
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteDripCampaign(id);
  return NextResponse.json({ success: true });
}
