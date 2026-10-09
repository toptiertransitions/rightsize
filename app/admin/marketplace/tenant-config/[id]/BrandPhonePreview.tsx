"use client";

import { useState } from "react";
import { House, Calendar, LayoutList, Handshake, DollarSign, UserPlus, Lightbulb } from "lucide-react";
import { colorScale, type BrandContactView, type TopTierVisibility } from "@/lib/brands/shared";
import { BrandContactsCard } from "@/components/brands/BrandContactsCard";

// Phone-sized live preview of the branded Home and Welcome screens. Sets
// the brand's CSS variables on this subtree only, so the real components
// (and Tailwind forest-*/accent-* classes) render in the brand's colors.
export function BrandPhonePreview(props: {
  displayName: string;
  subtitle: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeMessage: string;
  welcomeSenderName: string;
  welcomeSenderTitle: string;
  topTierVisibility: TopTierVisibility;
  contacts: BrandContactView[];
}) {
  const [screen, setScreen] = useState<"home" | "welcome">("home");
  const p = colorScale(props.primaryColor);
  const s = colorScale(props.secondaryColor);
  const vars = Object.fromEntries(
    Object.entries(p).flatMap(([k, v]) => [[`--forest-${k}`, v], [`--accent-${k}`, s[k as unknown as keyof typeof s]]])
  ) as React.CSSProperties;
  const fullName = [props.displayName, props.subtitle].filter(Boolean).join(" ");
  const powered = props.topTierVisibility === "Minimal" ? "Powered by Rightsize" : "Move planning by Top Tier Transitions · Powered by Rightsize";

  const Logo = ({ big }: { big?: boolean }) =>
    props.logoUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={props.logoUrl} alt="" className={big ? "w-48 max-h-24 object-contain mx-auto" : "h-10 w-auto max-w-[150px] object-contain"} />
      : <span className={big ? "block text-center text-xl font-bold text-forest-700" : "font-bold text-forest-700 text-sm"}>{props.displayName || "Community"}</span>;

  return (
    <div>
      <div className="flex gap-1 mb-3 border border-gray-800 rounded-lg p-1 w-fit">
        {(["home", "welcome"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setScreen(k)} className={`px-3 py-1 rounded-md text-xs font-medium ${screen === k ? "bg-gray-700 text-white" : "text-gray-400"}`}>
            {k === "home" ? "Home screen" : "Welcome screen"}
          </button>
        ))}
      </div>
      <div className="w-[340px] h-[700px] bg-black rounded-[44px] p-2.5 shadow-2xl mx-auto">
        <div style={vars} className="w-full h-full bg-cream-50 rounded-[34px] overflow-hidden flex flex-col text-gray-900">
          <div className="h-8 flex-none bg-forest-800" />
          {screen === "home" ? (
            <>
              <div className="flex-none bg-white border-b border-cream-200 px-4 py-2.5 flex items-center justify-between">
                <Logo />
                <span className="w-8 h-8 rounded-full bg-gray-300" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-2xl font-bold">Welcome, Jane</p>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 bg-white border border-cream-200 rounded-xl px-3 py-2">
                  <UserPlus className="w-3.5 h-3.5" /> Invite Family Member
                </span>
                {props.contacts.length > 0 ? (
                  <BrandContactsCard
                    displayName={props.displayName || "Community"}
                    contacts={props.contacts}
                    welcomeMessage={props.welcomeMessage}
                    welcomeSenderName={props.welcomeSenderName}
                    welcomeSenderTitle={props.welcomeSenderTitle}
                  />
                ) : (
                  <p className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl p-3">No visible contacts, so the contacts card is hidden.</p>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  {[["5", "Items cataloged", "View catalog"], ["5", "Partners on your team", "View partners"], ["", "Project Plan", "View plan"], ["", "Tips and Advice", "View tips"]].map(([n, t, go], i) => (
                    <div key={t} className="bg-white border border-cream-200 rounded-2xl p-3 min-h-[104px] flex flex-col">
                      <span className="w-7 h-7 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-1.5">
                        {[<LayoutList key="a" className="w-4 h-4" />, <Handshake key="b" className="w-4 h-4" />, <Calendar key="c" className="w-4 h-4" />, <Lightbulb key="d" className="w-4 h-4" />][i]}
                      </span>
                      {n ? <p className="text-xl font-bold leading-none">{n}</p> : <p className="text-xs font-bold">{t}</p>}
                      {n && <p className="text-[11px] text-gray-500 mt-0.5">{t}</p>}
                      <p className="text-[11px] font-semibold text-accent-700 mt-auto pt-1">{go} →</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 text-center pt-1">{powered}</p>
              </div>
              <div className="flex-none bg-white border-t border-cream-200 grid grid-cols-5 pt-1.5 pb-4">
                {[["Home", House], ["Plan", Calendar], ["Catalog", LayoutList], ["Partners", Handshake], ["Sales", DollarSign]].map(([label, Icon], i) => {
                  const I = Icon as typeof House;
                  return (
                    <span key={label as string} className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${i === 0 ? "text-accent-700" : "text-gray-500"}`}>
                      <I className="w-5 h-5" />{label as string}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-3">
              <Logo big />
              <p className="text-2xl font-bold text-center leading-tight mt-2">Welcome to your move-in plan</p>
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                {props.welcomeMessage || "Your community team and Top Tier Transitions will walk you through every step, from sorting to settling in."}
              </p>
              <div className="bg-white border border-cream-200 rounded-xl px-3 py-2 text-[11px] text-gray-500">
                Referred by<b className="block text-sm text-gray-900">{fullName || "Your community"} ✓</b>
              </div>
              <div className="bg-forest-600 text-white text-center rounded-xl py-3 text-sm font-semibold">Create my account</div>
              <div className="bg-white border border-cream-200 text-accent-700 text-center rounded-xl py-3 text-sm font-semibold">I already have an account</div>
              <p className="text-[11px] text-gray-500 text-center">Not from {props.displayName || "this community"}? Enter a different community code</p>
              <p className="mt-auto text-[10px] text-gray-400 text-center">{powered}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
