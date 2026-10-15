"use server";

import { timingSafeEqual } from "crypto";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";

// App store review access: Google and Apple reviewers can't receive the
// Device Trust email code Clerk sends on a new device, so this signs them in
// to the demo account with a one-time Clerk sign-in ticket instead. Only
// ever the account in REVIEW_DEMO_USER_ID; unset either env var to turn it off.
export async function reviewAccessAction(_prev: { error?: string } | undefined, formData: FormData) {
  const expected = process.env.REVIEW_ACCESS_CODE ?? "";
  const userId = process.env.REVIEW_DEMO_USER_ID ?? "";
  if (!expected || !userId) return { error: "Review access is not available." };

  const code = String(formData.get("code") ?? "").trim();
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "That code isn't right." };
  }

  const clerk = await clerkClient();
  const { token } = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 300 });
  redirect(`/sign-in?__clerk_ticket=${encodeURIComponent(token)}&redirect_url=${encodeURIComponent("/home")}`);
}
