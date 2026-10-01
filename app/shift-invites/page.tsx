import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PendingInvitesClient } from "./PendingInvitesClient";

export default async function ShiftInvitesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <PendingInvitesClient />;
}
