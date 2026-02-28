import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream-100 to-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-forest-600 rounded-xl flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-forest-700 leading-none">Rightsize</div>
            <div className="text-[10px] text-gray-400">by Top Tier</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/calculator" className="text-sm text-forest-700 font-medium hover:underline hidden sm:block">
            Free Rightsizing Calculator
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm font-medium px-4 py-2 rounded-full mb-8">
          <span className="w-2 h-2 bg-forest-500 rounded-full animate-pulse" />
          Trusted by senior downsizing families
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Make every move{" "}
          <span className="text-forest-600">feel manageable.</span>
        </h1>

        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Rightsize helps you estimate the effort, catalog every item, and plan
          the perfect next chapter — whether you&apos;re moving to a condo, a
          retirement community, or helping a loved one transition.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/calculator">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Free Rightsizing Calculator
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="lg" className="w-full sm:w-auto">
              Create Free Account
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="mt-20 grid sm:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: "📐",
              title: "Rightsizing Calculator",
              desc: "Get a room-by-room estimate of hours needed to sort, pack, and unpack — before you commit to a timeline.",
            },
            {
              icon: "📸",
              title: "AI Item Catalog",
              desc: "Snap a photo, let Claude AI analyze the item, then review condition, value, and the best route (sell, donate, discard).",
            },
            {
              icon: "👨‍👩‍👧",
              title: "Family & Team Access",
              desc: "Invite family members, coordinators, or your Top Tier helper with role-based access to keep everyone aligned.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-white p-6 rounded-2xl border border-cream-200 shadow-sm">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-cream-200 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Top Tier Transitions · Rightsize Platform</p>
      </footer>
    </div>
  );
}
