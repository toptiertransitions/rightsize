"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2, Upload, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contrastRatio, HEX_RE, MAX_BRAND_CONTACTS, type BrandContactRef, type BrandContactView, type CommunityBrand,
} from "@/lib/brands/shared";
import {
  saveBrandAction, setBrandStatusAction, generateCodeAction, listCrmCompaniesAction, linkCrmCompanyAction, type SaveBrandInput,
} from "../actions";
import { BrandPhonePreview } from "./BrandPhonePreview";
import { JoinLinkPanel } from "./JoinLinkPanel";

interface PickableContact { id: string; name: string; title: string; phone: string; email: string }

const inputCls = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full placeholder-gray-600 disabled:opacity-50";
const labelCls = "block text-xs font-medium text-gray-400 mb-1.5";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

async function uploadImage(file: File, folder: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("tenantId", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok || !json.photoUrl) throw new Error(json.error || "Upload failed");
  return json.photoUrl as string;
}

/** Square, face-centered crop via Cloudinary (no manual crop step needed). */
function squareCrop(url: string): string {
  return url.includes("res.cloudinary.com") && url.includes("/upload/") && !url.includes("c_fill")
    ? url.replace("/upload/", "/upload/c_fill,g_face,w_400,h_400/")
    : url;
}

export function BrandEditor({ brand, partnerName, crmCompanyLinked, pickableContacts, joinBaseUrl, audit }: {
  brand: CommunityBrand;
  partnerName: string;
  crmCompanyLinked: boolean;
  pickableContacts: PickableContact[];
  joinBaseUrl: string;
  audit: { timestamp: string; actorName: string; field: string; newValue: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: brand.displayName,
    subtitle: brand.subtitle,
    slug: brand.slug,
    communityCode: brand.communityCode,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    welcomeMessage: brand.welcomeMessage,
    welcomeSenderName: brand.welcomeSenderName,
    welcomeSenderTitle: brand.welcomeSenderTitle,
    topTierVisibility: brand.topTierVisibility,
  });
  const [contacts, setContacts] = useState<BrandContactRef[]>(brand.contacts);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState(brand.status);
  const [uploading, setUploading] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const slugLocked = !!brand.slugLockedAt;

  const byId = useMemo(() => new Map(pickableContacts.map((c) => [c.id, c])), [pickableContacts]);
  const previewContacts: BrandContactView[] = contacts
    .filter((c) => c.visible && byId.has(c.contactId))
    .map((c) => {
      const p = byId.get(c.contactId)!;
      return { id: p.id, name: p.name, title: c.titleOverride || p.title, phone: p.phone, email: p.email, photoUrl: c.photoUrl };
    });

  const colorsValid = HEX_RE.test(form.primaryColor) && HEX_RE.test(form.secondaryColor);
  const warnings: string[] = [];
  if (colorsValid) {
    if (contrastRatio("#ffffff", form.primaryColor) < 4.5) warnings.push("White text on the primary color (buttons) is below WCAG AA (4.5:1).");
    if (contrastRatio("#ffffff", form.secondaryColor) < 4.5) warnings.push("White text on the secondary color (initials, badges) is below WCAG AA.");
    if (contrastRatio(form.secondaryColor, "#ffffff") < 3) warnings.push("The secondary color is hard to read as text on white (links, Call buttons).");
  }

  async function save(confirmIdentityChange = false) {
    setSaving(true);
    setMsg(null);
    const input: SaveBrandInput = {
      ...form,
      contacts: contacts.map((c) => ({ contactId: c.contactId, visible: c.visible, titleOverride: c.titleOverride ?? "", photoUrl: c.photoUrl ?? "" })),
      confirmIdentityChange,
    };
    const r = await saveBrandAction(brand.id, input);
    setSaving(false);
    if (!r.ok && r.error === "CONFIRM_REQUIRED") {
      if (window.confirm("This tenant is live. Changing the community code means the old code stops working for new sign-ups. Continue?")) return save(true);
      return;
    }
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }

  async function toggleStatus() {
    const next = status === "Active" ? "Draft" : "Active";
    const prompt = next === "Active"
      ? `Publish ${form.displayName}? Clients on projects assigned to it will see this branding.${slugLocked ? "" : " The slug can't change after publishing."}`
      : `Move ${form.displayName} back to Draft? Its clients will see Top Tier branding again.`;
    if (!window.confirm(prompt)) return;
    const r = await setBrandStatusAction(brand.id, next);
    if (r.ok) { setStatus(next); router.refresh(); } else setMsg({ ok: false, text: r.error });
  }

  async function viewAsTenant() {
    await fetch("/api/admin/brands/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id }) });
    window.open("/home", "_blank");
  }

  async function onLogo(file: File) {
    if (!/^image\/(png|jpe?g|svg\+xml)$/.test(file.type)) { setMsg({ ok: false, text: "Logo must be PNG, JPG, or SVG" }); return; }
    if (file.size > LOGO_MAX_BYTES) { setMsg({ ok: false, text: "Logo must be under 2 MB" }); return; }
    setUploading("logo");
    try { set({ logoUrl: await uploadImage(file, "brand-logos") }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed" }); }
    setUploading(null);
  }

  async function onPhoto(contactId: string, file: File) {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setMsg({ ok: false, text: "Headshots must be PNG or JPG" }); return; }
    if (file.size > PHOTO_MAX_BYTES) { setMsg({ ok: false, text: "Headshots must be under 5 MB" }); return; }
    setUploading(contactId);
    try {
      const url = squareCrop(await uploadImage(file, "brand-headshots"));
      setContacts((cs) => cs.map((c) => (c.contactId === contactId ? { ...c, photoUrl: url } : c)));
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed" }); }
    setUploading(null);
  }

  function move(i: number, dir: -1 | 1) {
    setContacts((cs) => {
      const next = [...cs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const remaining = pickableContacts.filter((p) => !contacts.some((c) => c.contactId === p.id));

  return (
    <div className="mt-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">{[form.displayName, form.subtitle].filter(Boolean).join(" ") || "Untitled tenant"}</h1>
          <p className="text-sm text-gray-500">Marketplace partner: {partnerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${status === "Active" ? "bg-green-900/40 text-green-300" : "bg-gray-800 text-gray-400"}`}>{status}</span>
          <button onClick={viewAsTenant} className="h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 inline-flex items-center gap-1.5">
            <ExternalLink className="w-4 h-4" /> View as tenant
          </button>
          <button onClick={toggleStatus} className="h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800">
            {status === "Active" ? "Move to Draft" : "Publish"}
          </button>
          <button onClick={() => save()} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {msg && <p className={cn("text-sm mb-4", msg.ok ? "text-green-400" : "text-red-400")}>{msg.text}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-6">
          {/* Identity */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Identity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Display name</label><input className={inputCls} value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder="The Roosevelt" /></div>
              <div><label className={labelCls}>Subtitle (optional)</label><input className={inputCls} value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="at Salt Creek" /></div>
              <div>
                <label className={labelCls}>Slug {slugLocked && <span className="text-gray-600">(locked after publishing)</span>}</label>
                <input className={cn(inputCls, "font-mono")} value={form.slug} disabled={slugLocked} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              </div>
              <div>
                <label className={labelCls}>Community code</label>
                <div className="flex gap-2">
                  <input className={cn(inputCls, "font-mono uppercase")} value={form.communityCode} onChange={(e) => set({ communityCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
                  <button
                    type="button"
                    onClick={async () => { const r = await generateCodeAction(form.displayName, brand.id); if (r.ok && r.data) set({ communityCode: r.data }); }}
                    className="h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 whitespace-nowrap"
                  >Generate</button>
                </div>
              </div>
            </div>
          </section>

          {/* Logo */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Logo</h2>
            <p className="text-xs text-gray-500 mb-4">PNG, SVG, or JPG under 2 MB. A transparent background works best.</p>
            <div className="flex flex-wrap items-center gap-4">
              {["bg-white", "bg-gray-950 border border-gray-700"].map((bg) => (
                <div key={bg} className={cn("w-40 h-20 rounded-lg flex items-center justify-center p-2", bg)}>
                  {form.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={form.logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                    : <span className="text-xs text-gray-500">No logo</span>}
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <label className="h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-4 h-4" /> {uploading === "logo" ? "Uploading…" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); e.target.value = ""; }} />
                </label>
                {form.logoUrl && <button type="button" onClick={() => set({ logoUrl: "" })} className="text-xs text-gray-500 hover:text-gray-300 text-left">Remove logo</button>}
              </div>
            </div>
          </section>

          {/* Colors */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Colors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([["primaryColor", "Primary", "Buttons, headings, status bar"], ["secondaryColor", "Secondary (accent)", "Icons, View links, Call buttons, active tab"]] as const).map(([key, label, hint]) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <div className="flex gap-2">
                    <input type="color" value={HEX_RE.test(form[key]) ? form[key] : "#000000"} onChange={(e) => set({ [key]: e.target.value.toUpperCase() } as Partial<typeof form>)} className="h-9 w-12 rounded border border-gray-700 bg-gray-950 p-0.5" />
                    <input className={cn(inputCls, "font-mono uppercase")} value={form[key]} onChange={(e) => set({ [key]: e.target.value.toUpperCase() } as Partial<typeof form>)} maxLength={7} />
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">{hint}</p>
                </div>
              ))}
            </div>
            {!colorsValid && <p className="text-xs text-red-400 mt-3">Use 6-digit hex colors like #1F3A5F.</p>}
            {warnings.map((w) => (
              <p key={w} className="text-xs text-amber-400 mt-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{w}</p>
            ))}
          </section>

          {/* Welcome */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Welcome message</h2>
            <textarea rows={3} maxLength={600} value={form.welcomeMessage} onChange={(e) => set({ welcomeMessage: e.target.value })}
              placeholder="We're so glad you're joining us. Our team and Top Tier Transitions will help with every step."
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white placeholder-gray-600" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div><label className={labelCls}>Sender name (optional)</label><input className={inputCls} value={form.welcomeSenderName} onChange={(e) => set({ welcomeSenderName: e.target.value })} /></div>
              <div><label className={labelCls}>Sender title (optional)</label><input className={inputCls} value={form.welcomeSenderTitle} onChange={(e) => set({ welcomeSenderTitle: e.target.value })} /></div>
            </div>
            <div className="mt-4">
              <label className={labelCls}>Top Tier visibility</label>
              <select className={inputCls} value={form.topTierVisibility} onChange={(e) => set({ topTierVisibility: e.target.value as typeof form.topTierVisibility })}>
                <option value="Partner visible">Partner visible: &ldquo;Move management by Top Tier Transitions · Powered by Rightsize&rdquo;</option>
                <option value="Minimal">Minimal: only &ldquo;Powered by Rightsize&rdquo;</option>
              </select>
            </div>
          </section>

          {/* Contacts */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-semibold text-white">Contacts</h2>
              <span className="text-xs text-gray-500">{contacts.length} of {MAX_BRAND_CONTACTS}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Names, phones, and emails come from the CRM contact. You can override the title and add a headshot here.</p>
            {!crmCompanyLinked ? (
              <LinkCrmCompany brandId={brand.id} onLinked={() => router.refresh()} />
            ) : (
              <>
                <ul className="space-y-3">
                  {contacts.map((c, i) => {
                    const p = byId.get(c.contactId);
                    return (
                      <li key={c.contactId} className={cn("rounded-lg border border-gray-800 p-3", !c.visible && "opacity-60")}>
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs text-gray-400">
                            {c.photoUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={c.photoUrl} alt="" className="w-full h-full object-cover" />
                              : (p?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{p?.name ?? "Contact not found"}</p>
                            <p className="text-xs text-gray-500 truncate">{[p?.phone, p?.email].filter(Boolean).join(" · ") || "No phone or email on file"}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="w-4 h-4" /></IconBtn>
                            <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === contacts.length - 1}><ArrowDown className="w-4 h-4" /></IconBtn>
                            <IconBtn label={c.visible ? "Hide" : "Show"} onClick={() => setContacts((cs) => cs.map((x) => (x.contactId === c.contactId ? { ...x, visible: !x.visible } : x)))}>
                              {c.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </IconBtn>
                            <IconBtn label="Remove" onClick={() => setContacts((cs) => cs.filter((x) => x.contactId !== c.contactId))}><Trash2 className="w-4 h-4" /></IconBtn>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mt-3">
                          <input className={inputCls} placeholder={p?.title ? `Title (default: ${p.title})` : "Title override"} value={c.titleOverride ?? ""}
                            onChange={(e) => setContacts((cs) => cs.map((x) => (x.contactId === c.contactId ? { ...x, titleOverride: e.target.value } : x)))} />
                          <div className="flex items-center gap-2">
                            <label className="h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-xs hover:bg-gray-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                              <Upload className="w-3.5 h-3.5" /> {uploading === c.contactId ? "Uploading…" : c.photoUrl ? "Replace headshot" : "Add headshot"}
                              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(c.contactId, f); e.target.value = ""; }} />
                            </label>
                            {c.photoUrl && (
                              <button type="button" onClick={() => setContacts((cs) => cs.map((x) => (x.contactId === c.contactId ? { ...x, photoUrl: undefined } : x)))} className="text-xs text-gray-500 hover:text-gray-300">Remove</button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {contacts.length >= MAX_BRAND_CONTACTS ? (
                  <p className="text-xs text-amber-400 mt-3">That&apos;s the limit of {MAX_BRAND_CONTACTS} contacts. Remove one to add another.</p>
                ) : remaining.length > 0 ? (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) setContacts((cs) => [...cs, { contactId: e.target.value, order: cs.length, visible: true }]); }}
                    className={cn(inputCls, "mt-3")}
                  >
                    <option value="">+ Add a contact…</option>
                    {remaining.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` (${p.title})` : ""}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-gray-500 mt-3">All of this company&apos;s contacts are added. Add more people to the company in the CRM.</p>
                )}
              </>
            )}
          </section>

          <JoinLinkPanel joinUrl={`${joinBaseUrl}${form.slug}`} code={form.communityCode} displayName={[form.displayName, form.subtitle].filter(Boolean).join(" ")} />

          {audit.length > 0 && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Recent changes</h2>
              <ul className="space-y-1.5 text-xs text-gray-400">
                {audit.map((a, i) => (
                  <li key={i}><span className="text-gray-500">{new Date(a.timestamp).toLocaleString()}</span> · {a.actorName} changed <span className="text-gray-300">{a.field}</span>{a.field !== "contacts" && a.newValue ? <> to <span className="text-gray-300">{a.newValue.slice(0, 60)}</span></> : null}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="lg:sticky lg:top-6 self-start">
          <BrandPhonePreview
            displayName={form.displayName}
            subtitle={form.subtitle}
            logoUrl={form.logoUrl}
            primaryColor={HEX_RE.test(form.primaryColor) ? form.primaryColor : brand.primaryColor}
            secondaryColor={HEX_RE.test(form.secondaryColor) ? form.secondaryColor : brand.secondaryColor}
            welcomeMessage={form.welcomeMessage}
            welcomeSenderName={form.welcomeSenderName}
            welcomeSenderTitle={form.welcomeSenderTitle}
            topTierVisibility={form.topTierVisibility}
            contacts={previewContacts}
          />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="w-8 h-8 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 flex items-center justify-center">
      {children}
    </button>
  );
}

function LinkCrmCompany({ brandId, onLinked }: { brandId: string; onLinked: () => void }) {
  const [companies, setCompanies] = useState<{ id: string; name: string; city: string }[] | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function load() {
    const r = await listCrmCompaniesAction();
    if (r.ok && r.data) setCompanies(r.data); else if (!r.ok) setError(r.error);
  }
  async function link() {
    setBusy(true);
    const r = await linkCrmCompanyAction(brandId, companyId);
    setBusy(false);
    if (r.ok) { setDone(true); onLinked(); } else setError(r.error);
  }

  const matches = (companies ?? []).filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  return (
    <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4">
      <p className="text-sm text-amber-200">This marketplace partner isn&apos;t linked to a CRM company yet, so there are no contacts to pick from.</p>
      {done ? <p className="text-sm text-green-400 mt-2 flex items-center gap-1.5"><Check className="w-4 h-4" /> Linked</p> : companies === null ? (
        <button type="button" onClick={load} className="mt-3 h-9 px-3 rounded-lg border border-gray-700 text-gray-200 text-sm hover:bg-gray-800">Link CRM company</button>
      ) : (
        <div className="mt-3 space-y-2">
          <input className={inputCls} placeholder="Search CRM companies" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className={inputCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Choose a company…</option>
            {matches.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
          </select>
          <button type="button" onClick={link} disabled={!companyId || busy} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm disabled:opacity-50">{busy ? "Linking…" : "Link company"}</button>
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

