import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const PARTNER_TYPES: {
  type: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    type: "Senior Living",
    label: "Senior Living Partner",
    desc: "Community or placement team",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
    ),
  },
  {
    type: "Realtor",
    label: "Realtor",
    desc: "Agent or brokerage",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a2 2 0 012 2m4 0a6 6 0 11-12 0 6 6 0 0112 0zM4 21l6.5-6.5" />
    ),
  },
  {
    type: "Moving Company",
    label: "Moving Company",
    desc: "Movers & haulers",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 16V6a1 1 0 011-1h9v11M3 16h10m0 0h4.5M3 16a2 2 0 104 0m6-.01a2 2 0 104 0M16 10h3.28a1 1 0 01.9.56l1.6 3.2A1 1 0 0122 14.2V16a1 1 0 01-1 1h-1" />
    ),
  },
  {
    type: "Other",
    label: "Other Partner",
    desc: "Attorney, advisor & more",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6v12m6-6H6" />
    ),
  },
];

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/home");

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Nav */}
      <nav className="max-w-md mx-auto px-6 pt-[max(20px,env(safe-area-inset-top))] pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image
            src="/ttt-icon.png"
            alt="Top Tier Transitions"
            width={34}
            height={34}
            className="w-[34px] h-[34px] object-contain"
            priority
          />
          <div>
            <div className="font-bold text-forest-700 leading-none">Rightsize</div>
            <div className="text-[10px] text-gray-400">by Top Tier</div>
          </div>
        </div>
        <Link href="/calculator" className="text-xs text-gray-400 hover:text-forest-600 font-medium">
          Calculator
        </Link>
      </nav>

      <main className="max-w-md mx-auto px-6 pb-16">
        {/* Headline */}
        <div className="pt-8 pb-7">
          <h1 className="text-[28px] leading-[1.15] font-bold text-gray-900">
            Let&rsquo;s get you to the right place.
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Rightsize by Top Tier Transitions — one platform for the move, from first walkthrough to move-in day.
          </p>
        </div>

        {/* Sign in — large, primary path for returning users */}
        <Link
          href="/sign-in"
          className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-forest-600 text-white font-semibold text-base shadow-sm hover:bg-forest-700 active:scale-[0.99] transition-all"
        >
          Sign In
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        <p className="text-center text-[11px] text-gray-400 mt-2.5">
          Already have an account? Start here.
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-8">
          <div className="h-px bg-cream-300 flex-1" />
          <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">New here?</span>
          <div className="h-px bg-cream-300 flex-1" />
        </div>

        {/* Client — featured persona */}
        <Link
          href="/sign-up"
          className="group flex items-center gap-4 w-full rounded-2xl bg-forest-700 text-white p-5 shadow-md hover:bg-forest-800 active:scale-[0.99] transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]">I&rsquo;m moving or rightsizing</div>
            <div className="text-xs text-white/70 mt-0.5">Create your free client account</div>
          </div>
          <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Referral partners */}
        <div className="mt-9">
          <div className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase mb-3">
            I&rsquo;m a referral partner
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PARTNER_TYPES.map((p) => (
              <Link
                key={p.type}
                href={`/sign-up/partner?type=${encodeURIComponent(p.type)}`}
                className="group flex flex-col gap-2.5 rounded-2xl bg-white border border-cream-200 p-4 hover:border-forest-300 hover:shadow-sm active:scale-[0.98] transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-forest-50 text-forest-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {p.icon}
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-[13.5px] text-gray-900 leading-tight">{p.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-14 pb-[env(safe-area-inset-bottom)] text-center space-y-3">
          <Link href="/sign-in" className="text-xs text-gray-400 hover:text-gray-600">
            TTT team member? <span className="text-forest-600 font-medium">Sign in here</span>
          </Link>
          <p className="text-[11px] text-gray-300">
            <Link href="/privacy" className="hover:text-gray-500">Privacy Policy</Link>
            <span className="mx-2">·</span>
            &copy; {new Date().getFullYear()} Top Tier Transitions
          </p>
        </div>
      </main>
    </div>
  );
}
