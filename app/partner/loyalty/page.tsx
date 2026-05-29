import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact } from "@/lib/partner";
import { PartnerLoyaltyStatus } from "@/components/partner/PartnerLoyaltyStatus";

const REDEMPTION_EXAMPLES = [
  {
    points: 5,
    label: "Donation Coordination",
    description: "5 hours of donation logistics — scheduling pickups, coordinating with charities, and handling removal from a client's home.",
  },
  {
    points: 10,
    label: "Quick Packing or Unpacking Support",
    description: "A focused 10-hour packing or unpacking session to help a client settle in or prepare for a move.",
  },
  {
    points: 20,
    label: "Staging or Internal Transfer Help",
    description: "20 hours of professional staging support or an internal room-to-room transfer to prepare a home for sale or reorganize a space.",
  },
  {
    points: 50,
    label: "Entire Transitions Management — Free",
    description: "Full end-to-end transition management for a client — consultation, packing, coordination, and move support at no cost.",
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
                <th className="px-4 py-2.5 font-medium text-gray-500 text-xs hidden sm:table-cell">Bonus Points</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Starting", color: "#6B7280", threshold: "—",      mult: 1, bonus: "—"            },
                { name: "Silver",   color: "#9CA3AF", threshold: "10 pts", mult: 1, bonus: "5 Bonus Points" },
                { name: "Gold",     color: "#C9A96E", threshold: "25 pts", mult: 2, bonus: "—"            },
                { name: "Platinum", color: "#378ADD", threshold: "75 pts", mult: 3, bonus: "—"            },
                { name: "Diamond",  color: "#7F77DD", threshold: "150 pts",mult: 4, bonus: "—"            },
              ].map((row, i) => (
                <tr key={row.name} className={i > 0 ? "border-t border-gray-100" : ""}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-sm" style={{ color: row.color }}>{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.threshold}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-sm" style={{ color: row.color }}>{row.mult}×</span>
                  </td>
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: row.bonus !== "—" ? row.color : undefined }}>
                    <span className={row.bonus !== "—" ? "font-semibold" : "text-gray-400"}>{row.bonus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Redemption value section */}
      <section>
        <div className="flex items-baseline gap-3 mb-1">
          <h2 className="text-base font-semibold text-gray-900">What your points are worth</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Each point redeems for <span className="font-semibold text-gray-800">1 hour of Top Tier Transitions service</span> — applied to your organization or gifted to any client.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {REDEMPTION_EXAMPLES.map(ex => (
            <div
              key={ex.points}
              className="rounded-xl border border-gray-200 bg-white px-4 py-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#2d4a3e]/8 text-[#2d4a3e]">
                  {ex.points} pts
                </span>
                <span className="text-sm font-semibold text-gray-900">{ex.label}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{ex.description}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Redemption examples above are illustrative and depend on exact service needs.
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
