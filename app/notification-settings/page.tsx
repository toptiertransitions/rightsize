import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NotificationSettingsClient } from "./NotificationSettingsClient";

export default async function NotificationSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <NotificationSettingsClient />;
}
