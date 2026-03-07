"use client";

import { useState, useRef } from "react";
import type { DripCampaign, DripSettings, DripStep, DripAudience } from "@/lib/types";

// ─── Pre-built senior living template sequences ───────────────────────────────
const TEMPLATE_SEQUENCES: { name: string; audience: DripAudience; description: string; steps: DripStep[] }[] = [
  {
    name: "Referral Partner Welcome",
    audience: "Referral Partners",
    description: "Warm onboarding sequence for new referral partners at senior living communities.",
    steps: [
      {
        dayOffset: 0,
        subject: "Welcome to our referral network, {{first_name}}!",
        previewText: "We're so glad to have {{company}} as a partner.",
        bodyHtml: `Hi {{first_name}},

Thank you for partnering with us at Top Tier Transitions. We specialize in helping seniors and families navigate rightsizing and downsizing transitions with care, efficiency, and compassion.

As a referral partner, you can count on us to:
- Provide white-glove service to every client you refer
- Keep you informed throughout the process
- Make you look great to the families you serve

We'd love to schedule a quick call to learn more about how we can best support {{company}}'s residents and families.

Looking forward to a great partnership!`,
      },
      {
        dayOffset: 3,
        subject: "How Top Tier Transitions works — a quick overview",
        previewText: "Here's exactly what we do for your families.",
        bodyHtml: `Hi {{first_name}},

I wanted to share a quick overview of how we support families through the transition process.

**Our Services:**
- Rightsizing Consultation — help families decide what to keep, donate, sell, or discard
- Packing & Unpacking — professional, careful handling of all belongings
- Estate Sale Coordination — maximizing value from unwanted items
- Move Management — coordinating timelines with your community

Most families we work with are overwhelmed. Your referral changes everything for them.

Would it help to have some printed materials to share with families at {{company}}?`,
      },
      {
        dayOffset: 7,
        subject: "A story you'll want to share with families at {{company}}",
        previewText: "Real impact, real families.",
        bodyHtml: `Hi {{first_name}},

One of the families we recently helped had been putting off their move for over a year — the thought of clearing out a 40-year family home felt impossible.

We spent three days with them. By the end, they were laughing and sharing stories while we carefully wrapped decades of memories.

That's what we do. And it's why families at {{company}} deserve to know we exist.

If you have anyone in mind right now who's struggling with the transition, I'd love an introduction.`,
      },
      {
        dayOffset: 14,
        subject: "Checking in — anything we can do for {{company}} this month?",
        previewText: "We're always here when you need us.",
        bodyHtml: `Hi {{first_name}},

Just a quick check-in. Do you have any families who are in the process of planning a move into {{company}} or evaluating their options?

We're available for:
- Free consultations for prospective residents
- Move-in coordination support
- Estate cleanouts after a transition

We'd also love to come by and meet the team at {{company}} if you think that would be valuable.

No pressure at all — just want to make sure you know we're here.`,
      },
    ],
  },
  {
    name: "Client Re-engagement",
    audience: "Client Contacts",
    description: "Re-engage past clients with helpful content and a warm check-in.",
    steps: [
      {
        dayOffset: 0,
        subject: "Hi {{first_name}} — checking in from Top Tier Transitions",
        previewText: "It's been a while. Hope everything is going well!",
        bodyHtml: `Hi {{first_name}},

We hope your transition has been going smoothly! We think of the families we work with long after the boxes are unpacked.

If you or anyone you know is facing a similar transition — whether it's a parent, a neighbor, or a friend — please don't hesitate to reach out. We'd love to help.

Wishing you and your family all the best.`,
      },
      {
        dayOffset: 7,
        subject: "5 tips for settling into your new home after a big move",
        previewText: "Helpful advice for making any new space feel like home.",
        bodyHtml: `Hi {{first_name}},

Moving is just the beginning — truly settling in takes time. Here are five tips we share with all our families:

1. **Unpack the bedroom first** — a good night's sleep makes everything easier
2. **Don't rush the walls** — live in a space before deciding where things go
3. **Find one "anchor" spot** — a chair, a lamp, something familiar that feels like home
4. **Meet one neighbor in the first week** — community makes all the difference
5. **Give yourself 30 days** — most people feel fully settled within a month

We hope {{first_name}} is loving the new chapter. If you ever need us again, we're just a message away.`,
      },
    ],
  },
  {
    name: "Referral Nurture — Monthly Touch",
    audience: "Referral Partners",
    description: "Low-pressure monthly touchpoint to stay top of mind with referral partners.",
    steps: [
      {
        dayOffset: 0,
        subject: "A quick note from Top Tier Transitions",
        previewText: "Staying connected — just wanted to say hello.",
        bodyHtml: `Hi {{first_name}},

Just reaching out to say hello and see how things are going at {{company}}.

We've been busy helping families with transitions this season and wanted to make sure you know we're always available for your residents.

Is there anything specific going on at {{company}} that we should know about? New buildings opening, increased move-in volume, or anything we can support?`,
      },
      {
        dayOffset: 30,
        subject: "Did you know we offer free family consultations?",
        previewText: "Something that might be helpful for families at {{company}}.",
        bodyHtml: `Hi {{first_name}},

A quick reminder that we offer complimentary consultations for families who are earlier in their decision-making process.

These 30-minute calls help families understand what rightsizing involves, what to expect, and how to prepare — with zero sales pressure.

If you have a family at {{company}} who is just starting to explore their options, an introduction to us could be genuinely helpful for them.

Happy to send over a one-pager you could share with families or staff.`,
      },
    ],
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────
interface Props {
  initialSettings: DripSettings | null;
  initialCampaigns: DripCampaign[];
}

type Tab = "branding" | "campaigns";

// ─── Step Editor ───────────────────────────────────────────────────────────
function StepEditor({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: DripStep;
  index: number;
  onChange: (s: DripStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Step {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Remove
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Send Day (0 = immediately)</label>
          <input
            type="number"
            min={0}
            value={step.dayOffset}
            onChange={(e) => onChange({ ...step, dayOffset: parseInt(e.target.value) || 0 })}
            className="w-24 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Subject Line</label>
          <input
            type="text"
            value={step.subject}
            onChange={(e) => onChange({ ...step, subject: e.target.value })}
            placeholder="e.g. Welcome to our network, {{first_name}}!"
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Preview Text</label>
          <input
            type="text"
            value={step.previewText}
            onChange={(e) => onChange({ ...step, previewText: e.target.value })}
            placeholder="Short preview shown in inbox..."
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email Body</label>
          <p className="text-[11px] text-gray-500 mb-1.5">
            Variables: {"{{first_name}} {{full_name}} {{company}} {{sender_name}} {{sender_email}}"}
          </p>
          <textarea
            value={step.bodyHtml}
            onChange={(e) => onChange({ ...step, bodyHtml: e.target.value })}
            rows={8}
            placeholder="Write your email body here. Use plain text or HTML. Double line breaks become paragraphs."
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-green-500 font-mono resize-y"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Editor Modal ─────────────────────────────────────────────────
function CampaignEditorModal({
  campaign,
  onClose,
  onSave,
}: {
  campaign: Partial<DripCampaign> | null;
  onClose: () => void;
  onSave: (c: Partial<DripCampaign>) => Promise<void>;
}) {
  const [name, setName] = useState(campaign?.name || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [audience, setAudience] = useState<DripAudience>(campaign?.audience || "Referral Partners");
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);
  const [steps, setSteps] = useState<DripStep[]>(campaign?.steps || []);
  const [saving, setSaving] = useState(false);

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { dayOffset: (prev[prev.length - 1]?.dayOffset || 0) + 7, subject: "", previewText: "", bodyHtml: "" },
    ]);

  const loadTemplate = (t: (typeof TEMPLATE_SEQUENCES)[0]) => {
    setName(t.name);
    setDescription(t.description);
    setAudience(t.audience);
    setSteps(t.steps);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...(campaign?.id ? { id: campaign.id } : {}), name, description, audience, isActive, steps });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-8 overflow-y-auto pb-8">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">{campaign?.id ? "Edit Campaign" : "New Campaign"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Template gallery */}
          {!campaign?.id && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Start from a template</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TEMPLATE_SEQUENCES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => loadTemplate(t)}
                    className="text-left bg-gray-800 border border-gray-700 rounded-xl p-3 hover:border-green-500 transition-colors"
                  >
                    <div className="text-xs font-semibold text-white mb-1">{t.name}</div>
                    <div className="text-[11px] text-gray-400 leading-relaxed">{t.description}</div>
                    <div className="mt-2 text-[10px] text-green-500 font-medium">{t.steps.length} steps · {t.audience}</div>
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-700 mt-4" />
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Campaign Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Referral Partner Welcome Sequence"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description for internal reference"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as DripAudience)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
              >
                <option value="Referral Partners">Referral Partners</option>
                <option value="Client Contacts">Client Contacts</option>
                <option value="Both">Both</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setIsActive((v) => !v)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${isActive ? "bg-green-600" : "bg-gray-600"}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-gray-300">Active</span>
              </label>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email Steps ({steps.length})</p>
              <button
                onClick={addStep}
                className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                + Add Step
              </button>
            </div>
            {steps.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm bg-gray-800 rounded-xl border border-gray-700">
                No steps yet. Add your first email step above or load a template.
              </div>
            )}
            <div className="space-y-3">
              {steps.map((step, i) => (
                <StepEditor
                  key={i}
                  step={step}
                  index={i}
                  onChange={(s) => setSteps((prev) => prev.map((p, j) => (j === i ? s : p)))}
                  onRemove={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-semibold transition-colors"
          >
            {saving ? "Saving..." : "Save Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export function AdminDripsClient({ initialSettings, initialCampaigns }: Props) {
  const [tab, setTab] = useState<Tab>("branding");
  const [settings, setSettings] = useState<Partial<DripSettings>>(
    initialSettings || {
      senderName: "",
      senderEmail: "",
      logoUrl: "",
      logoPublicId: "",
      primaryColor: "#2E6B4F",
      companyName: "",
      companyTagline: "",
      companyAddress: "",
      signatureHtml: "",
    }
  );
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [campaigns, setCampaigns] = useState<DripCampaign[]>(initialCampaigns);
  const [editingCampaign, setEditingCampaign] = useState<Partial<DripCampaign> | null | "new">(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Branding ──────────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      setSettings((s) => ({ ...s, logoUrl: data.url, logoPublicId: data.publicId }));
    } finally {
      setLogoUploading(false);
    }
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    try {
      const res = await fetch("/api/drip/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setBrandingSaved(true);
        setTimeout(() => setBrandingSaved(false), 2000);
      }
    } finally {
      setBrandingSaving(false);
    }
  };

  // ── Campaigns ─────────────────────────────────────────────────────────────
  const handleSaveCampaign = async (data: Partial<DripCampaign>) => {
    if (data.id) {
      const { id, ...rest } = data;
      const res = await fetch("/api/drip/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...rest }),
      });
      if (res.ok) {
        const { campaign } = await res.json();
        setCampaigns((prev) => prev.map((c) => (c.id === id ? campaign : c)));
      }
    } else {
      const res = await fetch("/api/drip/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { campaign } = await res.json();
        setCampaigns((prev) => [campaign, ...prev]);
      }
    }
    setEditingCampaign(null);
  };

  const handleDeleteCampaign = async (id: string) => {
    const res = await fetch(`/api/drip/campaigns?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    }
    setDeletingId(null);
  };

  const toggleActive = async (campaign: DripCampaign) => {
    const res = await fetch("/api/drip/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: campaign.id, isActive: !campaign.isActive }),
    });
    if (res.ok) {
      const { campaign: updated } = await res.json();
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-gray-800 p-1 rounded-xl w-fit">
        {(["branding", "campaigns"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "branding" ? "Email Branding" : "Campaigns"}
          </button>
        ))}
      </div>

      {/* ── Branding Tab ─────────────────────────────────────────────────── */}
      {tab === "branding" && (
        <div className="space-y-6">
          {/* Logo */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Logo</h2>
            <div className="flex items-center gap-5">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-16 object-contain rounded-lg bg-gray-800 p-2" />
              ) : (
                <div className="w-24 h-16 bg-gray-800 rounded-lg border border-dashed border-gray-600 flex items-center justify-center">
                  <span className="text-xs text-gray-500">No logo</span>
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {logoUploading ? "Uploading..." : "Upload Logo"}
                </button>
                {settings.logoUrl && (
                  <button
                    onClick={() => setSettings((s) => ({ ...s, logoUrl: "", logoPublicId: "" }))}
                    className="ml-3 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-gray-500 mt-1.5">PNG or SVG recommended. Max 2 MB.</p>
              </div>
            </div>
          </div>

          {/* Sender identity */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Sender Identity</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Default Sender Name</label>
                <input
                  type="text"
                  value={settings.senderName || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, senderName: e.target.value }))}
                  placeholder="Top Tier Transitions"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Default Sender Email</label>
                <input
                  type="email"
                  value={settings.senderEmail || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, senderEmail: e.target.value }))}
                  placeholder="hello@toptiertransitions.com"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                />
              </div>
            </div>
          </div>

          {/* Company info */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Company Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={settings.companyName || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
                  placeholder="Top Tier Transitions"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Tagline</label>
                <input
                  type="text"
                  value={settings.companyTagline || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, companyTagline: e.target.value }))}
                  placeholder="Compassionate transitions for seniors"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Company Address (for CAN-SPAM compliance)</label>
                <input
                  type="text"
                  value={settings.companyAddress || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, companyAddress: e.target.value }))}
                  placeholder="123 Main St, City, State 00000"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Brand Color (hex)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primaryColor || "#2E6B4F"}
                    onChange={(e) => setSettings((s) => ({ ...s, primaryColor: e.target.value }))}
                    className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={settings.primaryColor || "#2E6B4F"}
                    onChange={(e) => setSettings((s) => ({ ...s, primaryColor: e.target.value }))}
                    className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Email Signature */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-white mb-1">Email Signature (HTML)</h2>
            <p className="text-xs text-gray-500 mb-3">
              Optional. If blank, a default signature is generated from company name + tagline.
              Variables: {"{{sender_name}} {{sender_email}} {{company}}"}
            </p>
            <textarea
              value={settings.signatureHtml || ""}
              onChange={(e) => setSettings((s) => ({ ...s, signatureHtml: e.target.value }))}
              rows={4}
              placeholder={`<strong>{{sender_name}}</strong><br/>Top Tier Transitions<br/>{{sender_email}}`}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500 font-mono resize-y"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveBranding}
              disabled={brandingSaving}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
            >
              {brandingSaved ? "Saved!" : brandingSaving ? "Saving..." : "Save Branding"}
            </button>
          </div>
        </div>
      )}

      {/* ── Campaigns Tab ─────────────────────────────────────────────────── */}
      {tab === "campaigns" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-gray-400">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
            <button
              onClick={() => setEditingCampaign("new")}
              className="text-sm bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl font-semibold transition-colors"
            >
              + New Campaign
            </button>
          </div>

          {campaigns.length === 0 && (
            <div className="text-center py-20 text-gray-500 bg-gray-900 rounded-2xl border border-gray-800">
              No campaigns yet. Create one to get started.
            </div>
          )}

          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="bg-gray-900 rounded-2xl border border-gray-800 px-5 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${c.isActive ? "bg-green-600" : "bg-gray-600"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${c.isActive ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {c.steps.length} step{c.steps.length !== 1 ? "s" : ""} · {c.audience}
                      {c.description ? ` · ${c.description}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      c.isActive ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                  <button
                    onClick={() => setEditingCampaign(c)}
                    className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingId(c.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Editor Modal */}
      {editingCampaign !== null && (
        <CampaignEditorModal
          campaign={editingCampaign === "new" ? null : editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onSave={handleSaveCampaign}
        />
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-bold text-white mb-2">Delete campaign?</h3>
            <p className="text-sm text-gray-400 mb-5">This will permanently delete the campaign. Active enrollments will remain but won't receive future steps.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 text-sm text-gray-400 hover:text-white px-4 py-2 rounded-xl border border-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDeleteCampaign(deletingId)} className="flex-1 text-sm bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl transition-colors font-semibold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
