"use client";

// The one steady screen shown while a new or returning session is being
// handed off (after sign-up, or if a signed-in person lands on /sign-in or
// /sign-up), so nobody sees a login form flash by mid-redirect.
export function AccountSplash({ message = "Setting up your account…", overlay = false }: { message?: string; overlay?: boolean }) {
  return (
    <div className={`${overlay ? "fixed inset-0 z-[100]" : "h-[100dvh]"} bg-cream-50 flex flex-col items-center justify-center px-6 text-center`}>
      <div className="w-12 h-12 rounded-2xl bg-forest-600 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      <svg className="animate-spin h-5 w-5 text-forest-500 mb-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-base font-medium text-gray-700">{message}</p>
    </div>
  );
}

/** True when this browser already holds a Clerk session (the __client_uat
 * cookie is set and non-zero). Readable before Clerk itself has loaded. */
export function hasClerkSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  const m = document.cookie.match(/(?:^|;\s*)__client_uat[^=]*=([^;]+)/);
  return !!m && m[1] !== "0";
}
