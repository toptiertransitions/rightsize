"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { House, Calendar, LayoutList, Handshake, DollarSign, Lightbulb, Receipt, UserPlus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorScale } from "@/lib/brands/shared";
import { BrandContactsCard } from "@/components/brands/BrandContactsCard";
import { ResidentChecklistCard } from "@/components/community-checklist/ResidentChecklistCard";
import { CategorySection } from "@/components/partners/CategorySection";
import { buildResidentChecklist, summarize, todayYmd, type ChecklistItemState } from "@/lib/checklists/shared";
import { isInServiceArea, matchPartnersForCategory } from "@/lib/partners/match";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import { useTenantPreview } from "./TenantPreviewContext";

// Phone-sized live preview of what this community's residents see: Home,
// Plan (with the community checklist), Partners (preferred partners ranked
// first with their badge) and the Welcome screen. Reads the editors' live
// state from TenantPreviewContext and sets the brand's CSS variables on this
// subtree only, so the real client components render in the brand's colors.

type Screen = "home" | "plan" | "partners" | "welcome";
type Resident = "self" | "ttt";

// Same order and icons as the app's bottom nav (components/layout/Header.tsx).
// Self-serve residents get Tips in Sales' slot; Top Tier clients get Sales
// and Invoices.
const NAV: Record<Resident, Array<{ label: string; icon: typeof House; screen?: Screen }>> = {
  self: [
    { label: "Home", icon: House, screen: "home" },
    { label: "Plan", icon: Calendar, screen: "plan" },
    { label: "Catalog", icon: LayoutList },
    { label: "Partners", icon: Handshake, screen: "partners" },
    { label: "Tips", icon: Lightbulb },
  ],
  ttt: [
    { label: "Home", icon: House, screen: "home" },
    { label: "Plan", icon: Calendar, screen: "plan" },
    { label: "Catalog", icon: LayoutList },
    { label: "Partners", icon: Handshake, screen: "partners" },
    { label: "Sales", icon: DollarSign },
    { label: "Invoices", icon: Receipt },
  ],
};

// Move Manager is always Top Tier and Community is the resident's own
// community, so the preview shows the categories partners compete in.
const PREVIEW_CATEGORIES: readonly PartnerCategory[] = PARTNER_CATEGORIES.filter((c) => c !== "Move Manager" && c !== "Community");

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function BrandPhonePreview({ initialScreen = "home", initialResident = "self" }: { initialScreen?: Screen; initialResident?: Resident } = {}) {
  const ctx = useTenantPreview();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [resident, setResident] = useState<Resident>(initialResident);
  const [zip, setZip] = useState(ctx?.defaultLocation.zip ?? "");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const targets = useRef<Record<string, HTMLElement | null>>({});
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const brand = ctx?.brand;
  const directory = ctx?.directory;
  const communityPartnerId = ctx?.communityPartnerId;
  const preferredIds = ctx?.preferredIds;
  const communityName = brand?.displayName || "Community";

  // Jump to whatever was just edited
  const lastChange = ctx?.lastChange;
  useEffect(() => {
    if (!lastChange || !directory) return;
    if (lastChange.kind === "checklist") {
      setScreen("plan");
      setPendingScroll("checklist");
    } else {
      setScreen("partners");
      const cat = directory.find((p) => p.id === lastChange.partnerId && PREVIEW_CATEGORIES.includes(p.category))?.category;
      setPendingScroll(cat ? `cat-${cat}` : null);
    }
  }, [lastChange, directory]);

  useEffect(() => {
    if (!pendingScroll) return;
    const box = scrollRef.current;
    const el = targets.current[pendingScroll];
    setPendingScroll(null);
    if (!box || !el) return;
    // Scroll only the phone, never the admin page
    const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
    box.scrollTo({ top, behavior: "smooth" });
  }, [pendingScroll, screen]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [resident]);

  // Partners: the same matching the client Partners page runs, with this
  // community's preferred partners labeled and ranked first
  const partners = useMemo(() => {
    if (!directory || !preferredIds) return { sections: [], hidden: [] as string[] };
    const preferred = new Set(preferredIds);
    const pool = directory
      .filter((p) => p.id !== communityPartnerId)
      .map((p) => (preferred.has(p.id) ? { ...p, preferredBy: [communityName] } : p));
    const location = zip.trim() ? { zip: zip.trim(), state: ctx?.defaultLocation.state } : { state: ctx?.defaultLocation.state };
    const sections = PREVIEW_CATEGORIES
      .map((category) => ({ category, matches: matchPartnersForCategory(pool, category, location, 3, preferred) }))
      .filter((s) => s.matches.length > 0);
    const shown = new Set(sections.flatMap((s) => s.matches.map((m) => m.partner.id)));
    const hidden = [...new Set(
      pool.filter((p) => preferred.has(p.id) && PREVIEW_CATEGORIES.includes(p.category) && !shown.has(p.id) && !isInServiceArea(p, location)).map((p) => p.vendorName)
    )];
    return { sections, hidden };
  }, [directory, preferredIds, communityPartnerId, communityName, zip, ctx?.defaultLocation.state]);

  if (!ctx || !brand) return null;

  // Plan: the community checklist against a sample move date a month out
  const today = todayYmd();
  const moveDate = addDays(today, 30);
  const states: ChecklistItemState[] = [...doneIds].map((itemId) => ({ itemId, tenantId: "preview", done: true, doneAt: new Date().toISOString(), doneByName: "Jane", doneByRole: "Resident" }));
  const rows = buildResidentChecklist(ctx.checklistItems, states, moveDate, today);

  const p = colorScale(brand.primaryColor);
  const s = colorScale(brand.secondaryColor);
  const vars = Object.fromEntries(
    Object.entries(p).flatMap(([k, v]) => [[`--forest-${k}`, v], [`--accent-${k}`, s[k as unknown as keyof typeof s]]])
  ) as React.CSSProperties;
  const fullName = [brand.displayName, brand.subtitle].filter(Boolean).join(" ");
  const powered = brand.topTierVisibility === "Minimal" ? "Powered by Rightsize" : "Move management by Top Tier Transitions · Powered by Rightsize";
  const selfServe = resident === "self";
  const preferredCategories = partners.sections.filter((sec) => sec.matches.some((m) => m.partner.preferredBy?.length)).map((sec) => sec.category);

  const Logo = ({ big }: { big?: boolean }) =>
    brand.logoUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={brand.logoUrl} alt="" className={big ? "w-48 max-h-24 object-contain mx-auto" : "h-10 w-auto max-w-[150px] object-contain"} />
      : <span className={big ? "block text-center text-xl font-bold text-forest-700" : "font-bold text-forest-700 text-sm"}>{communityName}</span>;

  const Tile = ({ icon, count, title, sub, go, to, wide }: { icon: React.ReactNode; count?: string; title: string; sub?: string; go: string; to?: Screen; wide?: boolean }) => (
    <button
      type="button"
      onClick={() => to && setScreen(to)}
      className={cn("text-left bg-white border border-cream-200 rounded-2xl p-3 min-h-[104px] flex flex-col", wide && "col-span-2", to ? "cursor-pointer hover:border-accent-200" : "cursor-default")}
    >
      <span className="w-7 h-7 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-1.5">{icon}</span>
      {count ? <p className="text-xl font-bold leading-none">{count}</p> : <p className="text-xs font-bold">{title}</p>}
      <p className="text-[11px] text-gray-500 mt-0.5">{count ? title : sub}</p>
      <p className="text-[11px] font-semibold text-accent-600 mt-auto pt-1">{go} →</p>
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex gap-1 border border-gray-800 rounded-lg p-1">
          {(["home", "plan", "partners", "welcome"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setScreen(k)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${screen === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <div className="flex gap-1 border border-gray-800 rounded-lg p-1" role="group" aria-label="Resident type">
          {([["self", "Self-serve resident"], ["ttt", "Top Tier client"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setResident(k)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${resident === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
        {screen === "partners" && (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
            Resident zip
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="Any"
              className="w-16 h-7 px-2 rounded-md bg-gray-950 border border-gray-700 text-xs text-white font-mono placeholder-gray-600"
            />
          </label>
        )}
      </div>

      <div className="w-[360px] h-[min(720px,calc(100vh-150px))] min-h-[520px] bg-black rounded-[44px] p-2.5 shadow-2xl mx-auto">
        <div style={vars} className="w-full h-full bg-cream-50 rounded-[34px] overflow-hidden flex flex-col text-gray-900">
          <div className="h-8 flex-none bg-forest-800" />
          {screen === "welcome" ? (
            <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-3">
              <Logo big />
              <p className="text-2xl font-bold text-center leading-tight mt-2">Welcome to your move-in plan</p>
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                {brand.welcomeMessage || "Your community team and Top Tier Transitions will walk you through every step, from sorting to settling in."}
              </p>
              <div className="bg-white border border-cream-200 rounded-xl px-3 py-2 text-[11px] text-gray-500">
                Referred by<b className="block text-sm text-gray-900">{fullName || "Your community"} ✓</b>
              </div>
              <div className="bg-forest-600 text-white text-center rounded-xl py-3 text-sm font-semibold">Create my account</div>
              <div className="bg-white border border-cream-200 text-accent-700 text-center rounded-xl py-3 text-sm font-semibold">I already have an account</div>
              <p className="text-[11px] text-gray-500 text-center">Not from {communityName}? Enter a different community code</p>
              <p className="mt-auto text-[10px] text-gray-400 text-center">{powered}</p>
            </div>
          ) : (
            <>
              <div className="flex-none bg-white border-b border-cream-200 px-4 py-2.5 flex items-center justify-between">
                <Logo />
                <span className="w-8 h-8 rounded-full bg-gray-300" />
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                {screen === "home" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold leading-tight">{selfServe ? "Welcome, Jane" : "The Smith Move"}</p>
                      {!selfServe && <p className="text-sm text-gray-500">Owner</p>}
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 bg-white border border-cream-200 rounded-xl px-3 py-2">
                      <UserPlus className="w-3.5 h-3.5" /> {selfServe ? "Invite Family Member" : "Invite Member"}
                    </span>
                    {brand.contacts.length > 0 ? (
                      <BrandContactsCard
                        displayName={communityName}
                        contacts={brand.contacts}
                        welcomeMessage={brand.welcomeMessage}
                        welcomeSenderName={brand.welcomeSenderName}
                        welcomeSenderTitle={brand.welcomeSenderTitle}
                      />
                    ) : (
                      <p className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl p-3">No visible contacts, so the contacts card is hidden.</p>
                    )}
                    <div className="grid grid-cols-2 gap-2.5">
                      <Tile icon={<LayoutList className="w-4 h-4" />} count="24" title="Items cataloged" go="View catalog" />
                      {selfServe
                        ? <Tile icon={<Handshake className="w-4 h-4" />} count="3" title="Partners on Your Team" go="View partners" to="partners" />
                        : <Tile icon={<House className="w-4 h-4" />} count="6" title="Rooms · 1,850 SF" go="View rooms" />}
                      <Tile icon={<Calendar className="w-4 h-4" />} title="Project Plan" sub="View timeline and plans" go="View plan" to="plan" wide={!selfServe} />
                      {selfServe && <Tile icon={<Lightbulb className="w-4 h-4" />} title="Tips and Advice" sub="Guidance for every step" go="View tips" />}
                    </div>
                    <p className="text-[10px] text-gray-400 text-center pt-1">{powered}</p>
                  </div>
                )}

                {screen === "plan" && (
                  <div>
                    <p className="text-2xl font-bold">Plan</p>
                    <p className="text-sm text-gray-500 mt-0.5">Schedule daily focus areas for your project</p>
                    {/* Stand-in for the schedule above the checklist */}
                    <div className="mt-4 bg-white border border-cream-200 rounded-2xl p-3" aria-hidden="true">
                      <div className="grid grid-cols-7 gap-1 text-center">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="text-[10px] font-semibold text-gray-400">{d}</span>)}
                        {Array.from({ length: 14 }, (_, i) => (
                          <span key={i} className={cn("h-7 rounded-md text-[10px] flex items-center justify-center", i === 9 ? "bg-forest-600 text-white font-semibold" : [3, 4, 10].includes(i) ? "bg-accent-50 text-accent-700" : "bg-cream-50 text-gray-400")}>
                            {i + 1}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2">Schedule, shifts and recaps appear here.</p>
                    </div>
                    <div ref={(el) => { targets.current.checklist = el; }}>
                      {rows.length > 0 ? (
                        <div className="[&>section]:!mt-5">
                          <ResidentChecklistCard
                            communityName={communityName}
                            logoUrl={brand.logoUrl || undefined}
                            accent={brand.primaryColor}
                            moveDate={moveDate}
                            rows={rows}
                            summary={summarize(rows)}
                            canToggle
                            refreshOnToggle={false}
                            onToggle={async (itemId, done) => {
                              setDoneIds((prev) => { const next = new Set(prev); if (done) next.add(itemId); else next.delete(itemId); return next; });
                              return { ok: true };
                            }}
                          />
                        </div>
                      ) : (
                        <p className="mt-5 text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl p-3">No checklist tasks yet, so residents don&rsquo;t see a {communityName} checklist.</p>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 text-center pt-4">Sample move date a month from today. Checking items here doesn&rsquo;t save.</p>
                  </div>
                )}

                {screen === "partners" && (
                  <div>
                    <p className="text-2xl font-bold">Your Partners</p>
                    <p className="text-sm text-gray-500 mt-1 mb-3 leading-relaxed">
                      {selfServe ? "Answer a few quick questions to get matched in each category." : "Browse our vetted network and choose one in each category."}
                    </p>
                    {preferredCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {preferredCategories.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setPendingScroll(`cat-${c}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7A5C1E] bg-[#FBF5E6] border border-[#E9D9AE] rounded-full px-2 py-0.5"
                          >
                            <Star className="w-3 h-3" fill="currentColor" /> {selfServe ? nonTTTCategoryLabel(c) : c}
                          </button>
                        ))}
                      </div>
                    )}
                    {partners.sections.length === 0 ? (
                      <p className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl p-3">No Live partners match this zip yet.</p>
                    ) : (
                      <div className="space-y-7 [&_h2]:text-base">
                        {partners.sections.map(({ category, matches }) => (
                          <CategorySection
                            key={category}
                            tenantId="preview"
                            category={category}
                            label={selfServe ? nonTTTCategoryLabel(category) : undefined}
                            matches={matches}
                            canEdit
                            pending={false}
                            onSelect={() => {}}
                            onDeselect={() => {}}
                            onLearnMore={() => {}}
                            sectionRef={(el) => { targets.current[`cat-${category}`] = el; }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <nav
                className="flex-none bg-white border-t border-cream-200 grid pt-1.5 pb-4"
                style={{ gridTemplateColumns: `repeat(${NAV[resident].length}, minmax(0, 1fr))` }}
              >
                {NAV[resident].map(({ label, icon: Icon, screen: to }) => {
                  const active = to === screen;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => to && setScreen(to)}
                      className={cn("flex flex-col items-center gap-0.5 text-[10px] font-medium", active ? "text-accent-700" : "text-gray-500", to ? "cursor-pointer" : "cursor-default")}
                    >
                      <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />{label}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </div>
      </div>

      {screen === "partners" && (
        <div className="mt-3 space-y-1 text-[11px] text-gray-500 max-w-[360px] mx-auto">
          <p>Preferred partners rank first in their category and carry the gold badge, when they serve the resident&rsquo;s area.</p>
          {partners.hidden.length > 0 && (
            <p className="text-amber-400">Not shown for {zip || "this area"} (outside their service area): {partners.hidden.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
