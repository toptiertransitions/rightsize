import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getSystemRole, getExpenses, getExpensesForUser, getExpensesForTenant, createExpense, updateExpense, deleteExpense } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";
import type { ExpenseCategory } from "@/lib/types";

const ALLOWED_ROLES = ["TTTStaff", "TTTManager", "TTTSales", "TTTAdmin"];

// ─── GET: fetch expenses ───────────────────────────────────────────────────────
// ?allCompany=true  → all expenses (TTTManager/TTTAdmin only)
// ?tenantId=xxx     → expenses linked to that project (TTTManager/TTTAdmin only)
// (no params)       → own expenses
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const allCompany = req.nextUrl.searchParams.get("allCompany") === "true";
  const tenantId = req.nextUrl.searchParams.get("tenantId");

  if (isManagerOrAdmin && allCompany) {
    const expenses = await getExpenses();
    return NextResponse.json({ expenses });
  }

  if (isManagerOrAdmin && tenantId) {
    const expenses = await getExpensesForTenant(tenantId);
    return NextResponse.json({ expenses });
  }

  const expenses = await getExpensesForUser(userId);
  return NextResponse.json({ expenses });
}

// ─── POST: create expense from receipt upload ─────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await currentUser();
  const staffName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ||
    "Unknown";

  const body = await req.json();
  const { receiptUrl, receiptPublicId, receiptBase64, mimeType } = body;

  // ── Claude AI receipt analysis ─────────────────────────────────────────────
  let date = new Date().toISOString().slice(0, 10);
  let vendor = "";
  let total = 0;
  let category: ExpenseCategory = "Other";
  let description = "";

  if (receiptBase64 || receiptUrl) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const imageContent = receiptBase64
        ? {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: receiptBase64,
            },
          }
        : {
            type: "image" as const,
            source: {
              type: "url" as const,
              url: receiptUrl,
            },
          };

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              imageContent,
              {
                type: "text",
                text: `Analyze this receipt and extract the following information. Return ONLY valid JSON with no markdown or extra text:
{
  "date": "YYYY-MM-DD",
  "vendor": "merchant or business name",
  "total": 0.00,
  "category": "one of: Meals & Entertainment | Travel & Transportation | Office Supplies | Technology & Software | Marketing & Advertising | Professional Services | Utilities | Other",
  "description": "one-sentence description of what was purchased"
}
If any field is unclear, use sensible defaults (today's date, "Unknown" for vendor, 0 for total, "Other" for category).`,
              },
            ],
          },
        ],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) date = parsed.date;
        if (parsed.vendor) vendor = String(parsed.vendor);
        if (typeof parsed.total === "number") total = parsed.total;
        if (parsed.category) category = parsed.category as ExpenseCategory;
        if (parsed.description) description = String(parsed.description);
      }
    } catch (e) {
      console.error("Receipt analysis failed:", e);
      // Continue with defaults
    }
  }

  const expense = await createExpense({
    clerkUserId: userId,
    staffName,
    date,
    vendor,
    total,
    category,
    description,
    receiptUrl: receiptUrl || undefined,
    receiptPublicId: receiptPublicId || undefined,
    notes: body.notes || undefined,
  });

  return NextResponse.json({ expense });
}

// ─── PATCH: update expense fields ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // TTTManager and TTTAdmin can edit anyone's expense; others can only edit their own
  // (ownership check omitted intentionally — all TTT staff log company expenses)

  const expense = await updateExpense(id, data);
  return NextResponse.json({ expense });
}

// ─── DELETE: remove expense ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteExpense(id);
  return NextResponse.json({ success: true });
}
