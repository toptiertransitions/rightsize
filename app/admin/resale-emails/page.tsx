export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getListedProFoundFindsItems, getSystemRole, getTenants } from "@/lib/airtable";
import { isExcludedProject } from "@/lib/consignment-status-report";
import { addDays } from "@/lib/pricing/autoDrop";
import { computeAnchor } from "@/lib/resale-emails/data";
import { RESALE_LAUNCH_DATE, isResaleLive } from "@/lib/resale-emails/engine";
import { getResaleLog, getResaleStates } from "@/lib/resale-emails/store";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { ResaleEmailsClient, type ResaleProjectRow } from "./ResaleEmailsClient";

export default async function ResaleEmailsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") redirect("/home");

  const [tenants, states, listed, log] = await Promise.all([
    getTenants(),
    getResaleStates(),
    getListedProFoundFindsItems(),
    getResaleLog(),
  ]);

  const projects: ResaleProjectRow[] = tenants
    .filter((t) => !t.isLostDeal && !isExcludedProject(t.name))
    .map((t) => {
      const state = states.get(t.id);
      const mine = listed.filter((i) => i.tenantId === t.id);
      const computed = computeAnchor(mine);
      return {
        id: t.id,
        name: t.name,
        archived: !!t.isArchived,
        listedCount: mine.length,
        anchor: state?.anchorDate ?? computed ?? undefined,
        anchorSource: state?.anchorDate ? (state.anchorSource ?? "computed") : computed ? "computed, not yet locked" : undefined,
        anchorLog: state?.anchorLog ?? "",
        paused: !!state?.paused,
      };
    })
    .filter((p) => p.anchor || p.paused || log.some((r) => r.tenantId === p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="invoicing" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Resale Update Emails</h1>
          <p className="text-gray-400 text-sm mt-1">
            Ready-to-forward drafts sent to TTT Admins and Managers: Hands-on complete (Full invoice emailed), then Day 30, 60 and 90 from each
            project&apos;s anchor date. {isResaleLive()
              ? "Live: due emails are sent."
              : "Dry run: the daily run logs what it would send. Set RESALE_EMAILS_LIVE=1 to go live. The buttons below always send."}
            {" "}Milestones due before {RESALE_LAUNCH_DATE} are skipped.
          </p>
        </div>
        <ResaleEmailsClient
          projects={projects.map((p) => ({ ...p, dueDays: p.anchor ? [30, 60, 90].map((n) => addDays(p.anchor!, n)) : [] }))}
          log={log}
        />
      </main>
    </div>
  );
}
