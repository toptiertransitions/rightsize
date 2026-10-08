"use client";

import { Phone, ExternalLink, Mail } from "lucide-react";
import { CTA_COPY, TIPS_EMAIL, TIPS_PHONE_HREF, TIPS_WEBSITE } from "@/content/tips";
import { openInBrowser } from "@/lib/native";

export function TipsCTA() {
  return (
    <section aria-labelledby="tips-cta-title" className="mt-14 rounded-3xl bg-forest-800 text-white p-6 sm:p-10 text-center shadow-sm">
      <h2 id="tips-cta-title" className="text-2xl font-bold">{CTA_COPY.heading}</h2>
      <p className="mt-3 text-base text-white/80 max-w-xl mx-auto leading-relaxed">{CTA_COPY.body}</p>
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <a
          href={TIPS_PHONE_HREF}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px] px-6 rounded-xl bg-white text-forest-800 font-semibold hover:bg-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-forest-800"
        >
          <Phone aria-hidden="true" className="w-4 h-4" />
          {CTA_COPY.callLabel}
        </a>
        <a
          href={TIPS_WEBSITE}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.preventDefault(); void openInBrowser(TIPS_WEBSITE); }}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px] px-6 rounded-xl border border-white/30 text-white font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {CTA_COPY.websiteLabel}
          <ExternalLink aria-hidden="true" className="w-4 h-4" />
        </a>
      </div>
      <a href={`mailto:${TIPS_EMAIL}`} className="mt-5 inline-flex items-center gap-1.5 min-h-[44px] text-sm text-white/70 hover:text-white">
        <Mail aria-hidden="true" className="w-4 h-4" />
        {TIPS_EMAIL}
      </a>
    </section>
  );
}
