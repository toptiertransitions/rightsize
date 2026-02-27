import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-2">
          <div className="w-10 h-10 bg-forest-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div className="text-left">
            <div className="font-bold text-forest-700 leading-none">Rightsize</div>
            <div className="text-[11px] text-gray-400">by Top Tier</div>
          </div>
        </Link>
        <p className="text-sm text-gray-500">Free account · No credit card needed</p>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "shadow-md rounded-2xl border border-cream-200",
            headerTitle: "text-gray-900 font-bold",
            primaryButton:
              "bg-forest-600 hover:bg-forest-700 text-white rounded-xl h-12",
            socialButtonsBlockButton:
              "border border-gray-300 rounded-xl h-12 hover:bg-gray-50",
            formFieldInput: "rounded-xl h-12 border-gray-300",
          },
        }}
      />
    </div>
  );
}
