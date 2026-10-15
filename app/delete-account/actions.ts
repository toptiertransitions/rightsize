"use server";

import { auth } from "@clerk/nextjs/server";
import { deleteOwnAccount, type DeletionResult } from "@/lib/account-deletion";

export async function deleteMyAccountAction(): Promise<DeletionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, reason: "error", message: "Please sign in first." };
  return deleteOwnAccount(userId);
}
