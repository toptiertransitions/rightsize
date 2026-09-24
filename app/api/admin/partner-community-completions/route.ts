import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { isTTTAdmin } from "@/lib/config";
import { savePartnerCommunityCompletionsForTenant } from "@/lib/airtable";
import type { PartnerCategory } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tenantId, communityId, communityName, entries } = body as {
    tenantId?: string;
    communityId?: string;
    communityName?: string;
    entries?: Array<{ category: PartnerCategory; partnerId: string }>;
  };

  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  if (!Array.isArray(entries)) return NextResponse.json({ error: "entries must be an array" }, { status: 400 });
  const trimmedCommunityName = (communityName || "").trim();
  if (entries.length > 0 && !trimmedCommunityName) {
    return NextResponse.json({ error: "A community is required before tagging partners" }, { status: 400 });
  }

  try {
    const saved = await savePartnerCommunityCompletionsForTenant({
      tenantId,
      communityId: communityId || undefined,
      communityName: trimmedCommunityName,
      entries,
      taggedBy: userId,
    });
    revalidateTag("partner-community-completions");
    return NextResponse.json({ completions: saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}
