import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { generateContentIcon, ContentIconError } from "@/lib/content-icon";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { title, description, contentType, audience } = body as {
    title?: string;
    description?: string;
    contentType?: string;
    audience?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await generateContentIcon({ title, description, contentType, audience }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof ContentIconError ? e.message : "Failed to generate icon" }, { status: 500 });
  }
}
