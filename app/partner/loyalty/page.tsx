import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact } from "@/lib/partner";
import { PartnerLoyaltyStatus } from "@/components/partner/PartnerLoyaltyStatus";

const REDEMPTION_EXAMPLES = [
  {
    points: 1,
    label: "Client downsizing consultation",
    description: "A one-hour in-home session to help a client plan their next move — at no cost to them.",
  },
  {
    points: 3,
    label: "Estate sale preparation",
    description: "Three hours of professional staging, cataloging, or pricing for an upcoming estate sale.",
  },
  {
    points: 8,
    label: "Full transition coordination day",
    description: "A full day of hands-on support for a client's move, cleanout, or estate liquidation.",
  },
  {
    points: 15,
    label: "Complete estate sale package",
    description: "End-to-end management of a client's estate sale — setup, marketing, and sale day.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Refer a client",
    body: "Connect a client to Top Tier Transitions for any transition or estate need.",
  },
  {
    step: "2",
    title: "Earn points",
    body: "When their project completes, you earn 1 point — more at higher tiers.",
  },
  {
    step: "3",
    title: "Redeem for service",
    body: "Use points for TTT services for your organization or any client you choose.",
  },
];

export default async function PartnerLoyaltyPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#2d4a3e]">Premier Partner Rewards</h1>
        <p className="text-sm text-gray-500 mt-1">
          Earn points for every completed referral. Redeem them as real service hours — for your clients or your own organization.
        </p>
      </div>

      {/* Status widget (full, with tier ladder) */}
      <PartnerLoyaltyStatus partnerId={userId} />

      {/* Redemption value section */}
      <section>
        <div className="flex items-baseline gap-3 mb-1">
          <h2 className="text-base font-semibold text-gray-900">What your points are worth</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Each point redeems for <span className="font-semibold text-gray-800">1 hour of Top Tier Transitions service</span> — applied to your organization or gifted to any client.
        </p>

        {/* Examples grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {REDEMPTION_EXAMPLES.map(ex => (
            <div
              key={ex.points}
              className="rounded-xl border border-gray-200 bg-white px-4 py-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#2d4a3e]/8 text-[#2d4a3e]">
                  {ex.points} pt{ex.points !== 1 ? "s" : ""}
                </span>
                <span className="text-sm font-semibold text-gray-900">{ex.label}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{ex.description}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Points don&apos;t expire and can be combined for larger projects.
          Contact your TTT representative to redeem.
        </p>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS.map(item => (
            <div key={item.step} className="rounded-xl bg-[#2d4a3e]/[0.03] border border-[#2d4a3e]/10 px-4 py-4">
              <div className="w-7 h-7 rounded-full bg-[#2d4a3e] text-white text-xs font-bold flex items-center justify-center mb-3">
                {item.step}
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tier benefits recap */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Earn faster as you grow</h2>
        <p className="text-sm text-gray-500 mb-4">
          Higher tiers multiply your points — the more you refer, the faster you accumulate service hours.
        </p>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-2.5 font-medium text-gray-500 text-xs">Tier</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-xs">Reached at</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-xs">Points per referral</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-xs hidden sm:table-cell">Service hours per 10 referrals</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Starting", color: "#6B7280", threshold: "—",    mult: 1, hrs: 10  },
                { name: "Silver",   color: "#9CA3AF", threshold: "10 pts", mult: 1, hrs: 10  },
                { name: "Gold",     color: "#C9A96E", threshold: "25 pts", mult: 2, hrs: 20  },
                { name: "Platinum", color: "#378ADD", threshold: "75 pts", mult: 3, hrs: 30  },
                { name: "Diamond",  color: "#7F77DD", threshold: "150 pts",mult: 4, hrs: 40  },
              ].map((row, i) => (
                <tr key={row.name} className={i > 0 ? "border-t border-gray-100" : ""}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-sm" style={{ color: row.color }}>{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.threshold}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-sm" style={{ color: row.color }}>{row.mult}×</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                    {row.hrs} hrs
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Silver milestone: one-time +5 bonus when you first reach 10 points. Multiplier upgrades apply immediately. Points reset June 1; status carries into the next year.
        </p>
      </section>

      {/* Redeem CTA */}
      <section className="rounded-2xl bg-[#2d4a3e] px-6 py-6 text-white">
        <h2 className="text-base font-semibold mb-1">Ready to redeem?</h2>
        <p className="text-sm text-white/70 mb-4">
          Reach out to your TTT representative and let them know which service hours you&apos;d like to use — for your organization, or for a client you&apos;d like to reward.
        </p>
        <a
          href="mailto:partners@toptiertransitions.com"
          className="inline-block text-sm font-semibold bg-white text-[#2d4a3e] px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
        >
          Contact your TTT rep
        </a>
      </section>
    </div>
  );
}
