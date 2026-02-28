import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isTTTAdmin } from "@/lib/config";
import { UserButton } from "@clerk/nextjs";
import { CircleHandClient } from "./CircleHandClient";

export default async function CircleHandPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Admin Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-white text-sm">Rightsize</div>
                <div className="text-[9px] text-gray-400">TTT Admin Console</div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-gray-500 text-sm">
              <Link href="/admin" className="hover:text-gray-300 transition-colors">Admin</Link>
              <span>/</span>
              <span className="text-gray-300">Circle Hand Import</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded-full font-medium">
              🔐 Admin
            </span>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Circle Hand CSV Import</h1>
          <p className="text-gray-400 mt-1">
            Upload Circle Hand export CSVs to match consignment sales to Rightsize item records.
          </p>
        </div>

        <CircleHandClient />
      </main>
    </div>
  );
}
