import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getGmailToken, deleteGmailToken } from "@/lib/airtable";

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await getGmailToken(userId);
  if (token) {
    await deleteGmailToken(token.id);
  }
  return NextResponse.json({ ok: true });
}
