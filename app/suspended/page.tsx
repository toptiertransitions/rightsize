import { SignOutButton } from "@clerk/nextjs";

export default function SuspendedPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-900/30 border border-red-800 flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Account Suspended</h1>
        <p className="text-gray-400 text-sm mb-6">
          Your account has been suspended. Please contact{" "}
          <a href="mailto:hello@toptiertransitions.com" className="text-forest-400 hover:text-forest-300">
            hello@toptiertransitions.com
          </a>{" "}
          if you believe this is an error.
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <button className="w-full h-10 rounded-xl border border-gray-700 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors">
            Sign Out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
