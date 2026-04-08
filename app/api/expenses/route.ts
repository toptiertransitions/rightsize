import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getSystemRole, getExpenses, getExpensesForUser, getExpensesForTenant, getReimbursableExpenses, createExpense, updateExpense, deleteExpense } from "@/lib/airtable";
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
  const isSalesOrAbove = isManagerOrAdmin || sysRole === "TTTSales";
  const allCompany = req.nextUrl.searchParams.get("allCompany") === "true";
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const billableOnly = req.nextUrl.searchParams.get("billable") === "true";

  // ?reimbursable=true&from=YYYY-MM-DD&to=YYYY-MM-DD → for CSV payroll export
  const reimbursableOnly = req.nextUrl.searchParams.get("reimbursable") === "true";
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (isManagerOrAdmin && reimbursableOnly && from && to) {
    const expenses = await getReimbursableExpenses(from, to);
    return NextResponse.json({ expenses });
  }

  if (isManagerOrAdmin && allCompany) {
    const expenses = await getExpenses();
    return NextResponse.json({ expenses });
  }

  if (isSalesOrAbove && tenantId) {
    let expenses = await getExpensesForTenant(tenantId);
    if (billableOnly) expenses = expenses.filter(e => e.billable === true);
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

  // Default reimbursable by role: TTTStaff + TTTManager = YES, TTTAdmin + TTTSales = NO
  const defaultReimbursable = sysRole === "TTTStaff" || sysRole === "TTTManager";
  const reimbursable = typeof body.reimbursable === "boolean" ? body.reimbursable : defaultReimbursable;

  // ── Claude AI receipt analysis ─────────────────────────────────────────────
  let date = new Date().toISOString().slice(0, 10);
  let vendor = "";
  let total = 0;
  let category: ExpenseCategory = "Other";
  let description = "";

  // If no receipt, accept manually-supplied fields (no-receipt entry flow)
  if (!receiptUrl && !receiptBase64) {
    if (body.date) date = body.date;
    if (body.vendor) vendor = String(body.vendor);
    if (typeof body.total === "number") total = body.total;
    if (body.category) category = body.category as ExpenseCategory;
    if (body.description) description = String(body.description || "");
  }

  if (receiptBase64 || receiptUrl) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

      // Detect if this is a PDF (Cloudinary raw uploads include /raw/ in the URL)
      const isPdf = (mimeType === "application/pdf") ||
        (receiptUrl && (receiptUrl.includes("/raw/") || /\.pdf($|\?)/i.test(receiptUrl)));

      // Build the receipt content block for Claude
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let receiptContent: any;
      if (isPdf) {
        // PDFs must be sent as base64 document type
        let pdfBase64 = receiptBase64;
        if (!pdfBase64 && receiptUrl) {
          const pdfRes = await fetch(receiptUrl);
          const pdfBuf = await pdfRes.arrayBuffer();
          pdfBase64 = Buffer.from(pdfBuf).toString("base64");
        }
        receiptContent = {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64,
          },
        };
      } else if (receiptBase64) {
        receiptContent = {
          type: "image",
          source: {
            type: "base64",
            media_type: (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: receiptBase64,
          },
        };
      } else {
        receiptContent = {
          type: "image",
          source: {
            type: "url",
            url: receiptUrl,
          },
        };
      }

      const promptText = `Analyze this receipt and extract the following information. Return ONLY valid JSON with no markdown or extra text:
{
  "date": "YYYY-MM-DD",
  "vendor": "merchant or business name",
  "total": 0.00,
  "category": "one of: Meals & Entertainment | Travel & Transportation | Office Supplies | Technology & Software | Marketing & Advertising | Professional Services | Utilities | Other",
  "description": "one-sentence description of what was purchased"
}
If any field is unclear, use sensible defaults (today's date, "Unknown" for vendor, 0 for total, "Other" for category).`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageContent: any[] = [receiptContent, { type: "text", text: promptText }];

      // PDFs require client.beta.messages.create() with betas in the body;
      // regular client.messages.create() silently ignores a top-level betas field.
      const response = isPdf
        ? await client.beta.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            betas: ["pdfs-2024-09-25"],
            messages: [{ role: "user", content: messageContent }],
          })
        : await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            messages: [{ role: "user", content: messageContent }],
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
    reimbursable,
    tenantId: body.tenantId || undefined,
    tenantName: body.tenantName || undefined,
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
