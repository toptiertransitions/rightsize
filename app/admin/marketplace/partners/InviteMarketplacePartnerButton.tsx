"use client";

import { useState } from "react";
import { inviteMarketplacePartnerAction } from "./invite-actions";

interface CategoryOption { id: string; label: string }

const inputCls = "w-full h-10 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-500";

export function InviteMarketplacePartnerButton({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  function reset() {
    setCompanyName(""); setContactName(""); setEmail(""); setPhone(""); setCategoryIds([]); setError("");
  }

  function toggle(id: string) {
    setCategoryIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  }

  async function send() {
    setSending(true);
    setError("");
    const result = await inviteMarketplacePartnerAction({ companyName, contactName, email, phone, categoryIds });
    setSending(false);
    if (!result.ok) { setError(result.error); return; }
    setSentTo(email);
    reset();
    setOpen(false);
    setTimeout(() => setSentTo(""), 6000);
  }

  const canSend = companyName.trim() && contactName.trim() && email.trim() && categoryIds.length > 0 && !sending;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="h-10 px-4 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Invite Marketplace Partner
        </button>
        {sentTo && <span className="text-xs text-green-400">Invite sent to {sentTo}</span>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-white mb-1">Invite a marketplace partner</h2>
            <p className="text-sm text-gray-400 mb-5">
              They&apos;ll get a branded email to create their account, then set up their profile and matching criteria for the categories you pick.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Company</label>
                <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Comfort Keepers of Naperville" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Contact name</label>
                <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Phone <span className="text-gray-600">(optional)</span></label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(630) 555-0100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Email</label>
                <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
              </div>
            </div>

            <label className="block text-xs text-gray-400 mb-2">Categories</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map((c) => {
                const on = categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      on ? "bg-forest-600 border-forest-500 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:text-white"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={() => { setOpen(false); setError(""); }} className="h-10 px-4 rounded-lg text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={!canSend}
                className="h-10 px-4 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
