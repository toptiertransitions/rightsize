import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy — Rightsize by Top Tier Transitions",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream-100 to-white">
      <nav className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={32} height={32} className="w-8 h-8 object-contain" />
          <div>
            <div className="font-bold text-forest-700 leading-none text-sm">Rightsize</div>
            <div className="text-[10px] text-gray-400">by Top Tier</div>
          </div>
        </Link>
        <Link href="/" className="text-sm text-forest-700 font-medium hover:underline">
          Back to home
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pb-24 pt-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Effective date: September 18, 2026</p>

        <Section title="Who this applies to">
          <p>
            This policy covers the Rightsize platform operated by Top Tier Transitions (&ldquo;TTT,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us&rdquo;), including the web app at{" "}
            <span className="font-medium">app.toptiertransitions.com</span> and the Rightsize mobile app,
            for every account type: TTT staff, clients, and referral partners. Each role sees only the
            information relevant to its own account and permissions.
          </p>
        </Section>

        <Section title="Information we collect">
          <p><span className="font-medium text-gray-900">Account information.</span> Name, email address, phone number, and role, collected when your account is created (by you at sign-up, or by TTT staff on your behalf) and managed through our authentication provider, Clerk.</p>
          <p><span className="font-medium text-gray-900">Project and business data.</span> Information you or TTT staff enter about a move or downsizing project — inventory items, room assignments, pricing, schedules, messages, and related notes.</p>
          <p><span className="font-medium text-gray-900">Photos and files.</span> Photos of items, floorplans, and documents you or TTT staff upload, stored with our image and file hosting provider, Cloudinary.</p>
          <p><span className="font-medium text-gray-900">Messages.</span> Messages sent through the app&rsquo;s Communication Hub between staff, clients, and partners on a shared project.</p>
          <p><span className="font-medium text-gray-900">Device and push notification data.</span> If you enable notifications in the mobile app, we store a device push token (issued by Apple, associated with your account) so we can deliver message and project alerts to your device. We do not collect device location, contacts, or other device data through this mechanism.</p>
          <p><span className="font-medium text-gray-900">What we do not currently collect.</span> The Rightsize mobile app does not access or collect your device&rsquo;s GPS location. If a location-based feature is added in the future, this policy will be updated first and you will be asked for permission on your device before any location data is collected.</p>
        </Section>

        <Section title="How we use your information">
          <p>We use the information above to operate the Rightsize platform: coordinating and tracking downsizing/move projects, communicating between staff, clients, and partners, generating estimates and invoices, and improving the service.</p>
          <p>Some item descriptions and categorizations may be generated with the help of AI models (Anthropic Claude and/or OpenAI), using the project data you or staff provide, solely to assist with cataloging and is not used to make decisions about you.</p>
          <p>We do not use your information for advertising, and we do not sell your personal information to third parties.</p>
        </Section>

        <Section title="Who can see your information">
          <p>Access is scoped by role. TTT staff assigned to a project can see that project&rsquo;s data. Clients see only their own project. Referral partners see only the projects their company referred. No one outside your project&rsquo;s assigned staff, your own account, and (where applicable) the referring partner can see your information.</p>
        </Section>

        <Section title="Service providers">
          <p>We share information with the following providers, solely to operate the service on our behalf, under their own data protection terms:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium text-gray-900">Clerk</span> — authentication and account management</li>
            <li><span className="font-medium text-gray-900">Airtable</span> — primary data storage</li>
            <li><span className="font-medium text-gray-900">Cloudinary</span> — photo and file storage</li>
            <li><span className="font-medium text-gray-900">Resend</span> — transactional email delivery</li>
            <li><span className="font-medium text-gray-900">Vercel</span> — application hosting</li>
            <li><span className="font-medium text-gray-900">Apple</span> — push notification delivery, mobile app distribution</li>
            <li><span className="font-medium text-gray-900">Anthropic / OpenAI</span> — AI-assisted item cataloging</li>
          </ul>
        </Section>

        <Section title="Cookies and tracking">
          <p>We use a single functional session cookie (set by Clerk) to keep you signed in. We do not use advertising cookies, third-party trackers, or analytics that follow you across other sites or apps.</p>
        </Section>

        <Section title="Data security">
          <p>Data is encrypted in transit via HTTPS. Access to project data is restricted by account role and authentication. Photos, files, and business records are retained for as long as your account or project is active, and for a reasonable period afterward for business and legal record-keeping.</p>
        </Section>

        <Section title="Your choices">
          <p>You can request a copy of your account&rsquo;s data, or request that it be deleted, by contacting us at the address below. Deletion requests are subject to reasonable record-keeping requirements (for example, completed transaction records).</p>
          <p>You can disable push notifications at any time in your device&rsquo;s Settings app.</p>
        </Section>

        <Section title="Children">
          <p>Rightsize is a business tool intended for adults coordinating moves and downsizing projects. It is not directed at children, and we do not knowingly collect information from anyone under 13.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If we make material changes to this policy — including adding a location-based feature — we&rsquo;ll update the effective date above and, where required, notify affected users directly.</p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a href="mailto:info@toptiertransitions.com" className="text-forest-700 font-medium hover:underline">
              info@toptiertransitions.com
            </a>.
          </p>
        </Section>
      </main>
    </div>
  );
}
