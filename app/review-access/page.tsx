import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewAccessForm } from "./ReviewAccessForm";

// Sign-in for app store reviewers (see actions.ts). Hidden when not configured.
export const metadata: Metadata = { title: "App review access", robots: "noindex" };
export const dynamic = "force-dynamic";

export default function ReviewAccessPage() {
  if (!process.env.REVIEW_ACCESS_CODE || !process.env.REVIEW_DEMO_USER_ID) notFound();

  return (
    <div className="min-h-[100dvh] bg-cream-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-sm p-7">
        <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={48} height={48} className="w-12 h-12 mb-5" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">App review access</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          Enter the review code from the app store submission to open the Rightsize demo account.
        </p>
        <ReviewAccessForm />
      </div>
    </div>
  );
}
