import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getDripEnrollments, createDripEnrollment, updateDripEnrollment, deleteDripEnrollment } from "@/lib/airtable";

const ALLOWED = ["TTTManager", "TTTSales", "TTTAdmin"];

async function authorize() {
  const { userId } = await auth();
  if (!userId) return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role)) return { userId: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId, role, error: null };
}

export async function GET(req: NextRequest) {
  const { error } = await authorize();
  if (error) return error;
  const campaignId = req.nextUrl.searchParams.get("campaignId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const enrollments = await getDripEnrollments({ campaignId, status }).catch(() => []);
  return NextResponse.json({ enrollments });
}

export async function POST(req: NextRequest) {
  const { userId, error } = await authorize();
  if (error) return error;
  const body = await req.json();
  if (!body.campaignId || !body.contactEmail) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  const enrollment = await createDripEnrollment({
    campaignId: body.campaignId,
    campaignName: body.campaignName ?? "",
    contactType: body.contactType ?? "referral",
    contactId: body.contactId ?? "",
    contactEmail: body.contactEmail,
    contactName: body.contactName ?? "",
    company: body.company ?? "",
    enrolledAt: new Date().toISOString(),
    currentStep: 0,
    status: "Active",
    enrolledByClerkId: userId!,
  });
  return NextResponse.json({ enrollment });
}

export async function PATCH(req: NextRequest) {
  const { error } = await authorize();
  if (error) return error;
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const enrollment = await updateDripEnrollment(id, data);
  return NextResponse.json({ enrollment });
}

export async function DELETE(req: NextRequest) {
  const { error } = await authorize();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteDripEnrollment(id);
  return NextResponse.json({ success: true });
}
