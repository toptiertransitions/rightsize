"use client";

import { useState } from "react";
import type { InvoiceSettings } from "@/lib/types";

interface Props {
  initialSettings: InvoiceSettings | null;
}

export function InvoicingSettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Partial<InvoiceSettings>>(initialSettings ?? {});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  function update(key: keyof InvoiceSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSettings((prev) => ({ ...prev, logoUrl: data.url, logoPublicId: data.publicId }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/invoice-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  const inputClass =
    "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";
  const labelClass = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5";

  return (
    <div className="space-y-8">
      {/* Logo section */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Logo</h2>
        {settings.logoUrl ? (
          <div className="mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl}
              alt="Company logo"
              className="max-h-16 max-w-[200px] object-contain rounded-lg border border-gray-700 p-2 bg-white"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No logo uploaded.</p>
        )}
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="px-4 py-2 rounded-xl border border-gray-600 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors">
            {logoUploading ? "Uploading…" : settings.logoUrl ? "Replace Logo" : "Upload Logo"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
            disabled={logoUploading}
          />
        </label>
      </div>

      {/* Company info */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-5">Company Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Company Name</label>
            <input
              type="text"
              className={inputClass}
              value={settings.companyName ?? ""}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Top Tier Transitions"
            />
          </div>
          <div>
            <label className={labelClass}>Company Email</label>
            <input
              type="email"
              className={inputClass}
              value={settings.companyEmail ?? ""}
              onChange={(e) => update("companyEmail", e.target.value)}
              placeholder="hello@company.com"
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              className={inputClass}
              value={settings.companyPhone ?? ""}
              onChange={(e) => update("companyPhone", e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input
              type="text"
              className={inputClass}
              value={settings.companyAddress ?? ""}
              onChange={(e) => update("companyAddress", e.target.value)}
              placeholder="123 Main St, City, ST 00000"
            />
          </div>
        </div>
      </div>

      {/* Payment & footer */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white mb-1">Payment & Footer</h2>
        <div>
          <label className={labelClass}>Payment Link URL</label>
          <input
            type="url"
            className={inputClass}
            value={settings.paymentLinkUrl ?? ""}
            onChange={(e) => update("paymentLinkUrl", e.target.value)}
            placeholder="https://pay.stripe.com/..."
          />
          <p className="text-xs text-gray-500 mt-1">Shown as a &quot;Pay Now&quot; button in invoice emails and PDFs.</p>
        </div>
        <div>
          <label className={labelClass}>Invoice Footer Text</label>
          <textarea
            rows={3}
            className={inputClass}
            value={settings.invoiceFooter ?? ""}
            onChange={(e) => update("invoiceFooter", e.target.value)}
            placeholder="Thank you for your business. Payment due within 14 days."
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-forest-600 text-white font-semibold text-sm hover:bg-forest-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {msg && (
          <span className={`text-sm font-medium ${msg === "Saved." ? "text-green-400" : "text-red-400"}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
