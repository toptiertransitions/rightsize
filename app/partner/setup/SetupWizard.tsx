"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Inbox, SlidersHorizontal, Gift, FileText } from "lucide-react";
import { ProgressBar, BackLink, BottomCTA } from "@/components/onboarding/shared";
import { OnboardingTour, type Slide } from "@/app/get-started/steps/OnboardingTour";
import { getPartnerCriteria, readMatchCriteria, currentCriteriaValues, type MatchCriteria, type PartnerCriterion } from "@/lib/partners/criteria";
import type { PartnerCategory } from "@/lib/types";
import type { MarketplaceFieldDef } from "@/lib/marketplace/types";
import {
  BusinessFields, AboutFields, AreaFields, CriterionPicker, DetailsFields, FieldScreenInput,
  businessValid, areaValid, parseZipText, areaSaveInput, fieldScreenAnswered,
  type BusinessData, type AboutData, type AreaData,
} from "./SetupFields";
import { saveBusinessAction, saveAboutAction, saveServiceAreaAction, saveListingAction, submitSetupAction } from "./actions";
import {
  fieldScreensFor, setupDetailsFields, skipsAreaStep, inPersonOnly, partnerCategoryLabel, type FieldScreen,
} from "@/lib/marketplace/partnerScreens";

export interface SetupListing {
  id: string;
  label: string;
  fieldSchema: MarketplaceFieldDef[];
  attributes: Record<string, unknown>;
}

interface Props {
  firstName: string;
  business: BusinessData;
  about: AboutData;
  area: AreaData;
  listings: SetupListing[];
}

type Step =
  | { kind: "welcome" }
  | { kind: "business" }
  | { kind: "about" }
  | { kind: "area" }
  | { kind: "criterion"; listingId: string; label: string; criterion: PartnerCriterion; index: number; count: number }
  | { kind: "field"; listingId: string; label: string; field: MarketplaceFieldDef; screen: FieldScreen }
  | { kind: "details"; listingId: string; label: string; fields: MarketplaceFieldDef[] }
  | { kind: "review" }
  | { kind: "tour" };

function tourSlides(firstName: string): Slide[] {
  return [
    {
      icon: <Sparkles className="w-9 h-9" />,
      title: `You're all set, ${firstName || "there"}.`,
      body: "Our team will review your profile, usually within a business day or two. Here's a quick look at your partner portal.",
      nextLabel: "Show me around",
    },
    {
      icon: <Inbox className="w-9 h-9" />,
      title: "Families, Matched to You",
      body: "When a family on Rightsize needs what you offer, where you work, we introduce you. You'll hear from us by email and in your portal.",
      nextLabel: "Next",
    },
    {
      icon: <SlidersHorizontal className="w-9 h-9" />,
      title: "Your Listing, Your Way",
      body: "Update your profile, service area, and who you serve anytime from My Listing. Changes to your matching criteria take effect right away.",
      nextLabel: "Next",
    },
    {
      icon: <Gift className="w-9 h-9" />,
      title: "Refer and Earn",
      body: "Know a family planning a move? Refer them to Top Tier and earn points toward rewards. Track it all under Rewards.",
      nextLabel: "Next",
    },
    {
      icon: <FileText className="w-9 h-9" />,
      title: "Share Files with Clients",
      body: "Send a quote, contract, or checklist straight to a client you're working with from Documents. It shows up on their Partners page in Rightsize.",
      nextLabel: "Go to my portal",
    },
  ];
}

export function SetupWizard({ firstName, business: b0, about: a0, area: ar0, listings }: Props) {
  const router = useRouter();
  const [business, setBusiness] = useState(b0);
  const [about, setAbout] = useState(a0);
  const labels = listings.map((l) => l.label);
  const noAreaStep = skipsAreaStep(labels);
  const alwaysInPerson = inPersonOnly(labels);
  const isRealtor = labels.length > 0 && labels.every((l) => l === "Realtor");
  const [area, setArea] = useState<AreaData>(() => (alwaysInPerson ? { ...ar0, deliveryMode: "In-person" } : ar0));
  const [criteria, setCriteria] = useState<Record<string, MatchCriteria>>(() =>
    Object.fromEntries(listings.map((l) => [l.id, readMatchCriteria(l.attributes)]))
  );
  const [fields, setFields] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(listings.map((l) => [l.id, { ...l.attributes }]))
  );
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [{ kind: "welcome" }, { kind: "business" }, { kind: "about" }];
    if (!noAreaStep) s.push({ kind: "area" });
    for (const l of listings) {
      const defs = getPartnerCriteria(l.label as PartnerCategory);
      // Details fields with their own screen, right after the criteria
      // question they follow (or after all criteria), when they apply
      const screens = fieldScreensFor(l.label).filter((sc) => {
        if (!sc.showIf) return true;
        return (criteria[l.id]?.[sc.showIf.questionId] ?? []).includes(sc.showIf.value);
      });
      const fieldStep = (sc: FieldScreen): Step | null => {
        const field = l.fieldSchema.find((f) => f.key === sc.key);
        return field ? { kind: "field", listingId: l.id, label: l.label, field, screen: sc } : null;
      };
      const placed = new Set<string>();
      defs.forEach((c, i) => {
        s.push({ kind: "criterion", listingId: l.id, label: l.label, criterion: c, index: i, count: defs.length });
        for (const sc of screens.filter((x) => x.after === c.questionId)) {
          const st = fieldStep(sc);
          if (st) { s.push(st); placed.add(sc.key); }
        }
      });
      for (const sc of screens.filter((x) => !placed.has(x.key))) {
        const st = fieldStep(sc);
        if (st) s.push(st);
      }
      const f = setupDetailsFields(l.fieldSchema, l.label);
      if (f.length > 0) s.push({ kind: "details", listingId: l.id, label: l.label, fields: f });
    }
    s.push({ kind: "review" }, { kind: "tour" });
    return s;
  }, [listings, criteria, noAreaStep]);

  const step = steps[index];
  const progressTotal = steps.length - 2; // welcome and tour aren't counted

  const selectedFor = (listingId: string, c: PartnerCriterion) => currentCriteriaValues(c, criteria[listingId] ?? {});

  const canContinue = (() => {
    switch (step.kind) {
      case "business": return businessValid(business);
      case "area": return areaValid(area);
      case "criterion": return selectedFor(step.listingId, step.criterion).length > 0;
      case "field": return fieldScreenAnswered(step.field, step.screen, fields[step.listingId]?.[step.field.key]);
      default: return true;
    }
  })();

  async function save(): Promise<boolean> {
    let result: { ok: true } | { ok: false; error: string } = { ok: true };
    switch (step.kind) {
      case "business":
        result = await saveBusinessAction(business);
        // Senior communities skip "Where do you work?": families come to
        // them, so match within 25 miles of the community's own zip
        if (result.ok && noAreaStep) {
          result = await saveServiceAreaAction({
            deliveryMode: "In-person", counties: [], extraZips: [], statewide: false,
            radius: { zip: business.zip.trim(), miles: 25 },
          });
        }
        break;
      case "about":
        result = await saveAboutAction(about);
        break;
      case "area":
        result = await saveServiceAreaAction(areaSaveInput(area));
        break;
      case "criterion":
        result = await saveListingAction(step.listingId, {
          criteria: { [step.criterion.questionId]: selectedFor(step.listingId, step.criterion) },
        });
        break;
      case "field":
        result = await saveListingAction(step.listingId, { fields: { [step.field.key]: fields[step.listingId]?.[step.field.key] ?? null } });
        break;
      case "details": {
        const vals = fields[step.listingId] ?? {};
        result = await saveListingAction(step.listingId, { fields: Object.fromEntries(step.fields.map((f) => [f.key, vals[f.key]])) });
        break;
      }
      case "review":
        result = await submitSetupAction();
        break;
    }
    if (!result.ok) setError(result.error);
    return result.ok;
  }

  async function next() {
    setError("");
    setSaving(true);
    const ok = await save();
    setSaving(false);
    if (ok) {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
      window.scrollTo({ top: 0 });
    }
  }

  function back() {
    setError("");
    setIndex((i) => Math.max(0, i - 1));
  }

  function jumpTo(kind: Step["kind"], listingId?: string) {
    const i = steps.findIndex((s) => s.kind === kind && (!listingId || ("listingId" in s && s.listingId === listingId)));
    if (i >= 0) setIndex(i);
  }

  if (step.kind === "tour") {
    return (
      <Shell>
        <div className="flex-1 overflow-y-auto px-6">
          <div className="max-w-md mx-auto pt-[max(20px,env(safe-area-inset-top))]">
            <OnboardingTour
              firstName={firstName}
              summary=""
              slides={tourSlides(firstName)}
              onFinish={() => { router.replace("/partner/home"); router.refresh(); }}
            />
          </div>
        </div>
      </Shell>
    );
  }

  const { title, subtitle } = headingFor(step, business.companyName, listings);

  return (
    <Shell>
      {step.kind !== "welcome" && (
        <div className="w-full max-w-md mx-auto px-6 pt-[max(20px,env(safe-area-inset-top))] pb-3 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <BackLink onClick={back} />
            <div className="flex-1"><ProgressBar step={index} total={progressTotal} /></div>
          </div>
          <p className="text-[11px] font-semibold text-forest-600 uppercase tracking-wide">
            {step.kind === "criterion" || step.kind === "details" || step.kind === "field" ? partnerCategoryLabel(step.label) : "Your partner profile"}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className={step.kind === "welcome" ? "max-w-md mx-auto pt-[max(48px,env(safe-area-inset-top))]" : "max-w-md mx-auto pt-1"}>
          {step.kind === "welcome" ? (
            <Welcome firstName={firstName} company={business.companyName} labels={listings.map((l) => partnerCategoryLabel(l.label))} />
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 leading-snug">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
              <div className="mt-5">
                {step.kind === "business" && <BusinessFields data={business} onChange={setBusiness} realtor={isRealtor} />}
                {step.kind === "about" && <AboutFields data={about} onChange={setAbout} />}
                {step.kind === "area" && <AreaFields data={area} onChange={setArea} defaultZip={business.zip} inPersonOnly={alwaysInPerson} />}
                {step.kind === "criterion" && (
                  <CriterionPicker
                    criterion={step.criterion}
                    selected={selectedFor(step.listingId, step.criterion)}
                    onChange={(v) => setCriteria((c) => ({ ...c, [step.listingId]: { ...(c[step.listingId] ?? {}), [step.criterion.questionId]: v } }))}
                  />
                )}
                {step.kind === "field" && (
                  <FieldScreenInput
                    field={step.field}
                    screen={step.screen}
                    value={fields[step.listingId]?.[step.field.key]}
                    onChange={(v) => setFields((f) => ({ ...f, [step.listingId]: { ...(f[step.listingId] ?? {}), [step.field.key]: v } }))}
                  />
                )}
                {step.kind === "details" && (
                  <DetailsFields
                    schema={step.fields}
                    values={fields[step.listingId] ?? {}}
                    onChange={(v) => setFields((f) => ({ ...f, [step.listingId]: v }))}
                  />
                )}
                {step.kind === "review" && (
                  <Review business={business} about={about} area={noAreaStep ? null : area} listings={listings} criteria={criteria} onEdit={jumpTo} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-6 shrink-0">
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <BottomCTA
          onClick={next}
          disabled={!canContinue}
          loading={saving}
          label={step.kind === "welcome" ? "Let's get started" : step.kind === "review" ? "Submit my profile" : "Continue"}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Covers the portal header: setup is its own full-screen flow
  return <div className="fixed inset-0 z-[60] h-[100dvh] bg-cream-50 flex flex-col overflow-hidden">{children}</div>;
}

function headingFor(step: Step, company: string, listings: SetupListing[]): { title: string; subtitle?: string } {
  switch (step.kind) {
    case "business": return { title: "Your business", subtitle: "How families and our team will reach you." };
    case "about": return { title: `Tell families about ${company || "your business"}`, subtitle: "This shows on your listing in Rightsize." };
    case "area": return { title: "Where do you work?", subtitle: "We only match you with families in your area." };
    case "criterion": return {
      title: step.criterion.prompt,
      subtitle: `Pick all that apply. Families are asked: "${step.criterion.clientPrompt}"${step.count > 1 ? ` · ${step.index + 1} of ${step.count}` : ""}`,
    };
    case "field": return { title: step.screen.title, subtitle: step.screen.subtitle };
    case "details": return { title: `A few ${partnerCategoryLabel(step.label)} details`, subtitle: "Helps families compare and helps us match well." };
    case "review": return { title: "Look good?", subtitle: listings.length > 1 ? "Here's your profile across your categories." : "Here's your profile." };
    default: return { title: "" };
  }
}

function Welcome({ firstName, company, labels }: { firstName: string; company: string; labels: string[] }) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-forest-600 flex items-center justify-center mx-auto mb-6">
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Welcome{firstName ? `, ${firstName}` : ""}!</h1>
      <p className="text-base text-gray-600 mt-3 leading-relaxed">
        Let&apos;s set up {company || "your business"} in the Top Tier partner network. It takes about 5 minutes.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {labels.map((l) => (
          <span key={l} className="px-3 py-1.5 rounded-full bg-forest-50 text-forest-700 text-sm font-medium border border-forest-100">{l}</span>
        ))}
      </div>
      <div className="mt-8 text-left bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        {[
          ["Your business", "Contact info, logo, and a short description."],
          ["Where you work", "The counties or areas you serve."],
          ["Who you serve", "Quick taps so we match you with the right families."],
        ].map(([t, d], i) => (
          <div key={t} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-forest-100 text-forest-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t}</p>
              <p className="text-sm text-gray-500">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Review({ business, about, area, listings, criteria, onEdit }: {
  business: BusinessData;
  about: AboutData;
  area: AreaData | null;
  listings: SetupListing[];
  criteria: Record<string, MatchCriteria>;
  onEdit: (kind: Step["kind"], listingId?: string) => void;
}) {
  const areaText = !area ? "" : area.deliveryMode === "Virtual"
    ? "Virtual"
    : area.areaMode === "radius"
    ? `Within ${area.radiusMiles} miles of ${area.radiusZip}${area.deliveryMode === "Both" ? " and virtual" : ""}`
    : [area.statewide ? "All of Illinois" : `${area.counties.length} ${area.counties.length === 1 ? "county" : "counties"}`, parseZipText(area.extraZipsText).length ? `+ ${parseZipText(area.extraZipsText).length} zip codes` : "", area.deliveryMode === "Both" ? "and virtual" : ""].filter(Boolean).join(" ");

  return (
    <div className="space-y-3">
      <ReviewCard title="Business" onEdit={() => onEdit("business")}>
        <p className="font-medium text-gray-900">{business.companyName}</p>
        <p>{[business.pocName, business.phone, business.website].filter(Boolean).join(" · ")}</p>
      </ReviewCard>
      <ReviewCard title="About" onEdit={() => onEdit("about")}>
        <p>{about.shortBio || <span className="italic text-gray-400">No description yet</span>}</p>
      </ReviewCard>
      {area && (
        <ReviewCard title="Where you work" onEdit={() => onEdit("area")}>
          <p>{areaText}</p>
        </ReviewCard>
      )}
      {listings.map((l) => {
        const defs = getPartnerCriteria(l.label as PartnerCategory);
        return (
          <ReviewCard key={l.id} title={partnerCategoryLabel(l.label)} onEdit={() => onEdit("criterion", l.id)}>
            {defs.map((c) => {
              const picked = currentCriteriaValues(c, criteria[l.id] ?? {});
              return (
                <p key={c.questionId}>
                  <span className="text-gray-400">{c.prompt} </span>
                  {picked.length === c.options.length ? "All" : c.options.filter((o) => picked.includes(o.value)).map((o) => o.label).join(", ") || "None"}
                </p>
              );
            })}
          </ReviewCard>
        );
      })}
      <p className="text-xs text-gray-400 pt-2">You can change any of this later from My Listing.</p>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        <button type="button" onClick={onEdit} className="text-sm font-medium text-forest-600 min-h-[36px] px-1">Edit</button>
      </div>
      <div className="text-sm text-gray-600 space-y-1">{children}</div>
    </div>
  );
}
