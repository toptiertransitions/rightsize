import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole } from "@/lib/airtable";
import { MyPaySection } from "../home/MyPaySection";

// My Pay moved here from the home page (now "About Me"). Linked from the
// profile menu. Same audience as before: TTTStaff, TTTTeamLead, TTTManager.
export default async function MyPayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const role = await getSystemRole(userId);
  if (role !== "TTTStaff" && role !== "TTTTeamLead" && role !== "TTTManager") redirect("/home");
  return <MyPaySection clerkUserId={userId} />;
}
