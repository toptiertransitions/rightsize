import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "./OnboardingClient";
import { currentUser } from "@clerk/nextjs/server";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || "";
  const displayName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || email;

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-forest-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your project</h1>
        <p className="text-gray-500 leading-relaxed">
          Name this project after the move or the person you&apos;re helping. You can have multiple projects.
        </p>
      </div>
      <OnboardingClient email={email} displayName={displayName} />
    </div>
  );
}
