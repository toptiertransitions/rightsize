"use client";

// Contacts inside the community drawer: cards with tap-to-call and email,
// inline add / edit / remove, the Move-In Contact star, and reordering by
// drag or by the up / down buttons (keyboard friendly).
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatPhone, telHref } from "@/lib/communities/phones";
import { contactFieldsSchema, fieldErrors } from "@/lib/communities/schema";
import { CONTACT_ROLES, PHONE_LABELS, type CommunityContact, type Phone } from "@/lib/communities/types";
import { ConfirmDialog, CopyButton, Icon } from "./ui";

type ContactDraft = Pick<CommunityContact, "name" | "title" | "role" | "email" | "phones" | "isPrimaryMoveIn" | "notes">;
const blank = (): ContactDraft => ({ name: "", title: "", role: "", email: "", phones: [{ label: "Office", number: "" }], isPrimaryMoveIn: false, notes: "" });
const inputCls = (invalid?: boolean) => cn("w-full min-h-[44px] rounded-xl border px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white", invalid ? "border-red-400" : "border-gray-200");

function ContactForm({ initial, onCancel, onSave, saving, idPrefix }: {
  initial: ContactDraft; onCancel: () => void; onSave: (d: ContactDraft) => Promise<Record<string, string> | null>; saving: boolean; idPrefix: string;
}) {
  const [d, setD] = useState<ContactDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof ContactDraft>(k: K, v: ContactDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setPhone = (i: number, p: Partial<Phone>) => set("phones", d.phones.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: ContactDraft = {
      ...d,
      name: d.name.trim(),
      email: d.email.trim(),
      phones: d.phones.filter((p) => p.number.trim()).map((p) => ({ ...p, number: formatPhone(p.number) })),
    };
    const parsed = contactFieldsSchema.partial().safeParse(cleaned);
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (!cleaned.name) errs.name = "Name is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const serverErrs = await onSave(cleaned);
    if (serverErrs) setErrors(serverErrs);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-forest-200 bg-forest-50/30 p-3.5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="block text-xs font-semibold text-gray-700 mb-1">Name (required)</label>
          <input id={`${idPrefix}-name`} data-autofocus className={inputCls(!!errors.name)} value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          {errors.name && <p className="text-xs text-red-600 mt-1" role="alert">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-title`} className="block text-xs font-semibold text-gray-700 mb-1">Title (as they sign it)</label>
          <input id={`${idPrefix}-title`} className={inputCls()} value={d.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-role`} className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
          <select id={`${idPrefix}-role`} className={inputCls()} value={d.role} onChange={(e) => set("role", e.target.value as ContactDraft["role"])}>
            <option value="">Choose a role</option>
            {CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-email`} className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
          <input id={`${idPrefix}-email`} type="email" inputMode="email" className={inputCls(!!errors.email)} value={d.email} onChange={(e) => set("email", e.target.value)} />
          {errors.email && <p className="text-xs text-red-600 mt-1" role="alert">{errors.email}</p>}
        </div>
      </div>
      <fieldset>
        <legend className="block text-xs font-semibold text-gray-700 mb-1">Phones</legend>
        <div className="space-y-2">
          {d.phones.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label={`Phone ${i + 1} label`} className={cn(inputCls(), "w-28 shrink-0")} value={p.label} onChange={(e) => setPhone(i, { label: e.target.value as Phone["label"] })}>
                {PHONE_LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <input aria-label={`Phone ${i + 1} number`} type="tel" inputMode="tel" className={inputCls(!!errors[`phones.${i}.number`])} value={p.number} onChange={(e) => setPhone(i, { number: e.target.value })} onBlur={(e) => setPhone(i, { number: formatPhone(e.target.value) })} placeholder="(312) 555-0100" />
              <button type="button" onClick={() => set("phones", d.phones.filter((_, j) => j !== i))} aria-label={`Remove phone ${i + 1}`} className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"><Icon name="x" className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set("phones", [...d.phones, { label: "Mobile", number: "" }])} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-forest-700 min-h-[40px] px-1"><Icon name="plus" className="w-4 h-4" />Add a phone</button>
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-notes`} className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
        <textarea id={`${idPrefix}-notes`} rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-800 cursor-pointer">
        <input type="checkbox" checked={d.isPrimaryMoveIn} onChange={(e) => set("isPrimaryMoveIn", e.target.checked)} className="w-4 h-4 accent-forest-600" />
        Primary Move-In Contact (only one per community)
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button type="submit" disabled={saving} className="min-h-[44px] px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-60">{saving ? "Saving..." : "Save contact"}</button>
      </div>
    </form>
  );
}

export function ContactsSection({ communityId, contacts, setContacts, canEdit, toast, onChanged }: {
  communityId: string;
  contacts: CommunityContact[];
  setContacts: React.Dispatch<React.SetStateAction<CommunityContact[]>>;
  canEdit: boolean;
  toast: (text: string, tone?: "ok" | "error") => void;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CommunityContact | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const base = `/api/staff/communities/${communityId}/contacts`;

  /** Applies the one-primary rule locally so the star moves right away. */
  const withPrimary = (list: CommunityContact[], primaryId: string | null) =>
    primaryId ? list.map((c) => ({ ...c, isPrimaryMoveIn: c.id === primaryId })) : list;

  async function saveContact(id: string | "new", d: ContactDraft): Promise<Record<string, string> | null> {
    setSaving(true);
    try {
      const res = await fetch(id === "new" ? base : `${base}/${id}`, { method: id === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error ?? "Couldn't save the contact.", "error"); return data.fields ?? {}; }
      const saved: CommunityContact = data.contact;
      setContacts((list) => withPrimary(id === "new" ? [...list, saved] : list.map((c) => (c.id === id ? saved : c)), saved.isPrimaryMoveIn ? saved.id : null));
      setEditingId(null);
      toast(id === "new" ? `${saved.name} added.` : `${saved.name} saved.`);
      onChanged();
      return null;
    } catch {
      toast("Couldn't save the contact.", "error");
      return {};
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(c: CommunityContact) {
    const before = contacts;
    setContacts((list) => withPrimary(list, c.id));
    const res = await fetch(`${base}/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPrimaryMoveIn: true }) }).catch(() => null);
    if (!res?.ok) { setContacts(before); toast("Couldn't change the Move-In Contact.", "error"); return; }
    toast(`${c.name} is now the Move-In Contact.`);
    onChanged();
  }

  async function remove(c: CommunityContact) {
    const before = contacts;
    setContacts((list) => list.filter((x) => x.id !== c.id));
    const res = await fetch(`${base}/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setContacts(before); toast("Couldn't remove the contact.", "error"); return; }
    toast(`${c.name} removed.`);
    onChanged();
  }

  async function reorder(next: CommunityContact[]) {
    const before = contacts;
    setContacts(next.map((c, i) => ({ ...c, sortOrder: i })));
    const res = await fetch(`${base}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((c) => c.id) }) }).catch(() => null);
    if (!res?.ok) { setContacts(before); toast("Couldn't save the new order.", "error"); }
  }
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= contacts.length) return;
    const next = [...contacts];
    [next[i], next[j]] = [next[j], next[i]];
    reorder(next);
  };

  return (
    <div>
      {contacts.length === 0 && editingId !== "new" && (
        <p className="text-sm text-gray-500 mb-3">No contacts yet.{canEdit ? " Add the person who coordinates move-ins first." : ""}</p>
      )}
      <ul className="space-y-2">
        {contacts.map((c, i) => editingId === c.id ? (
          <li key={c.id}>
            <ContactForm idPrefix={`ct-${c.id}`} initial={{ name: c.name, title: c.title, role: c.role, email: c.email, phones: c.phones.length ? c.phones : [{ label: "Office", number: "" }], isPrimaryMoveIn: c.isPrimaryMoveIn, notes: c.notes }}
              onCancel={() => setEditingId(null)} onSave={(d) => saveContact(c.id, d)} saving={saving} />
          </li>
        ) : (
          <li
            key={c.id}
            draggable={canEdit}
            onDragStart={() => setDragId(c.id)}
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={() => {
              if (!dragId || dragId === c.id) return;
              const from = contacts.findIndex((x) => x.id === dragId);
              const next = [...contacts];
              const [moved] = next.splice(from, 1);
              next.splice(i, 0, moved);
              setDragId(null);
              reorder(next);
            }}
            onDragEnd={() => setDragId(null)}
            className={cn("rounded-xl border bg-white p-3.5", c.isPrimaryMoveIn ? "border-[#C9A96E]" : "border-gray-200", dragId === c.id && "opacity-50")}
          >
            <div className="flex items-start gap-2">
              {canEdit && <span className="text-gray-300 cursor-grab mt-1 hidden sm:block" aria-hidden="true"><Icon name="grip" className="w-4 h-4" /></span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                  {c.role && <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">{c.role}</span>}
                  {c.isPrimaryMoveIn && <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A96E]/15 text-[#7A5E2B] px-2 py-0.5 text-xs font-medium"><Icon name="star" filled className="w-3 h-3" />Move-In Contact</span>}
                </div>
                {c.title && <div className="text-xs text-gray-600 mt-0.5">{c.title}</div>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.phones.map((p, j) => (
                    <a key={j} href={telHref(p.number)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm text-gray-800 hover:border-forest-300 hover:bg-forest-50">
                      <Icon name="phone" className="w-4 h-4 text-forest-700" /><span className="text-xs text-gray-500">{p.label}</span>{p.number}
                    </a>
                  ))}
                  {c.email && (
                    <span className="inline-flex items-center">
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm text-gray-800 hover:border-forest-300 hover:bg-forest-50 break-all">
                        <Icon name="mail" className="w-4 h-4 text-forest-700" />{c.email}
                      </a>
                      <CopyButton text={c.email} label="Copy" onCopied={() => toast("Email copied.")} />
                    </span>
                  )}
                </div>
                {c.notes && <p className="text-xs text-gray-600 mt-2 whitespace-pre-line">{c.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-col sm:flex-row items-center gap-0.5 shrink-0">
                  {!c.isPrimaryMoveIn && (
                    <button onClick={() => makePrimary(c)} aria-label={`Make ${c.name} the Move-In Contact`} title="Make Move-In Contact" className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-[#C9A96E] hover:bg-gray-50"><Icon name="star" className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Icon name="arrowUp" className="w-4 h-4" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === contacts.length - 1} aria-label={`Move ${c.name} down`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Icon name="arrowDown" className="w-4 h-4" /></button>
                  <button onClick={() => setEditingId(c.id)} aria-label={`Edit ${c.name}`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"><Icon name="edit" className="w-4 h-4" /></button>
                  <button onClick={() => setRemoveTarget(c)} aria-label={`Remove ${c.name}`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50"><Icon name="trash" className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && (editingId === "new" ? (
        <div className="mt-2">
          <ContactForm idPrefix="ct-new" initial={{ ...blank(), isPrimaryMoveIn: contacts.length === 0 }} onCancel={() => setEditingId(null)} onSave={(d) => saveContact("new", d)} saving={saving} />
        </div>
      ) : (
        <button onClick={() => setEditingId("new")} className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-forest-700 hover:bg-forest-50 w-full justify-center">
          <Icon name="plus" className="w-4 h-4" />Add contact
        </button>
      ))}
      <ConfirmDialog
        open={!!removeTarget}
        title={`Remove ${removeTarget?.name ?? ""}?`}
        body="They'll come off this community's contact list and the PDF. The record is kept in Airtable, so an Admin can bring it back."
        confirmLabel="Remove contact"
        tone="danger"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => { const c = removeTarget!; setRemoveTarget(null); remove(c); }}
      />
    </div>
  );
}
