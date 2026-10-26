import type { NextRequest } from "next/server";
import { handlePlanEmail } from "@/lib/plan-emails/send";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handlePlanEmail(req, "mover-quote");
}
