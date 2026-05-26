import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserByClerkId, getStaffMember } from "@/lib/airtable";
import { TrainingClient } from "./TrainingClient";

export default async function TrainingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let userName = "Team Member";
  let userEmail = "";

  try {
    const user = await getUserByClerkId(userId);
    if (user) {
      userName = user.name || userName;
      userEmail = user.email || "";
    }
  } catch { /* ignore */ }

  if (!userEmail) {
    try {
      const staff = await getStaffMember(userId);
      if (staff) {
        userName = staff.displayName || userName;
        userEmail = staff.email || "";
      }
    } catch { /* ignore */ }
  }

  return <TrainingClient userName={userName} userEmail={userEmail} />;
}
