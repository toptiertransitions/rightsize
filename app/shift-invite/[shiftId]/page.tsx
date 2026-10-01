import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ShiftInviteClient } from "./ShiftInviteClient";

// Standalone page, like /help — reached via a push tap or the Pending
// Invites list, not through the main nav. No Header/nav chrome of its own.
export default async function ShiftInvitePage({ params }: { params: Promise<{ shiftId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { shiftId } = await params;
  return <ShiftInviteClient shiftId={shiftId} />;
}
