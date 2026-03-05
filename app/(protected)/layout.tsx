import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSystemRole } from "@/lib/airtable";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isManager = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isStaff = ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "");

  return (
    <div className="min-h-screen bg-cream-50">
      <Header isManager={isManager} isStaff={isStaff} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
