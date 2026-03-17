import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (role !== "TTTManager" && role !== "TTTAdmin") redirect("/home");

  const members = await getStaffMembers().catch(() => []);
  const active = members.filter((m) => m.isActive && m.role !== "TTTSales");

  return <StaffClient members={active} />;
}
