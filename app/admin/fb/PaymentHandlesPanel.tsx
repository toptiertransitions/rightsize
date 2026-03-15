"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { InvoiceSettings } from "@/lib/types";

interface Props {
  initialSettings: Pick<InvoiceSettings,
    | "venmoHandle" | "venmoQrUrl" | "venmoQrPublicId"
    | "zelleHandle"  | "zelleQrUrl"  | "zelleQrPublicId"
  > | null;
}

type Provider = "venmo" | "zelle";

interface ProviderState {
  handle: string;
  qrUrl: string;
  qrPublicId: string;
}

export function PaymentHandlesPanel({ initialSettings }: Props) {
  const [venmo, setVenmo] = useState<ProviderState>({
    handle: initialSettings?.venmoHandle ?? "",
    qrUrl: initialSettings?.venmoQrUrl ?? "",
    qrPublicId: initialSettings?.venmoQrPublicId ?? "",
  });
  const [zelle, setZelle] = useState<ProviderState>({
    handle: initialSettings?.zelleHandle ?? "",
    qrUrl: initialSettings?.zelleQrUrl ?? "",
    qrPublicId: initialSettings?.zelleQrPublicId ?? "",
  });

  const [uploading, setUploading] = useState<Provider | null>(null);
  const [saving, setSaving] = useState<Provider | null>(null);
  const [saved, setSaved] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  const venmoFileRef = useRef<HTMLInputElement>(null);
  const zelleFileRef = useRef<HTMLInputElement>(null);

  async function uploadQr(provider: Provider, file: File) {
    setUploading(provider);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", "admin");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (provider === "venmo") {
        setVenmo(prev => ({ ...prev, qrUrl: data.photoUrl, qrPublicId: data.photoPublicId }));
      } else {
        setZelle(prev => ({ ...prev, qrUrl: data.photoUrl, qrPublicId: data.photoPublicId }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function save(provider: Provider) {
    setSaving(provider);
    setSaved(null);
    setError("");
    try {
      const payload =
        provider === "venmo"
          ? { venmoHandle: venmo.handle, venmoQrUrl: venmo.qrUrl, venmoQrPublicId: venmo.qrPublicId }
          : { zelleHandle: zelle.handle, zelleQrUrl: zelle.qrUrl, zelleQrPublicId: zelle.qrPublicId };
      const res = await fetch("/api/invoice-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(provider);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  function ProviderCard({ provider, state, setState, fileRef }: {
    provider: Provider;
    state: ProviderState;
    setState: React.Dispatch<React.SetStateAction<ProviderState>>;
    fileRef: React.RefObject<HTMLInputElement | null>;
  }) {
    const label = provider === "venmo" ? "Venmo" : "Zelle";
    const accentColor = provider === "venmo" ? "text-blue-400" : "text-yellow-400";
    const borderColor = provider === "venmo" ? "border-blue-700/50" : "border-yellow-700/50";
    const bgColor = provider === "venmo" ? "bg-blue-900/20" : "bg-yellow-900/20";

    return (
      <div className={`rounded-xl border ${borderColor} ${bgColor} p-5 flex flex-col gap-4`}>
        <div className="flex items-center gap-2">
          <span className={`text-base font-semibold ${accentColor}`}>{label}</span>
        </div>

        {/* Handle input */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            {label} Handle
          </label>
          <input
            type="text"
            value={state.handle}
            onChange={e => setState(prev => ({ ...prev, handle: e.target.value }))}
            placeholder={provider === "venmo" ? "@username" : "Phone or email"}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>

        {/* QR code upload */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            QR Code Image
          </label>
          <div className="flex items-start gap-3">
            {state.qrUrl ? (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0 bg-white">
                <Image src={state.qrUrl} alt={`${label} QR`} fill className="object-contain p-1" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border border-dashed border-gray-600 flex items-center justify-center flex-shrink-0 text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadQr(provider, file);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading === provider}
                className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading === provider ? "Uploading…" : state.qrUrl ? "Replace" : "Upload QR"}
              </button>
              {state.qrUrl && (
                <button
                  onClick={() => setState(prev => ({ ...prev, qrUrl: "", qrPublicId: "" }))}
                  className="text-xs px-3 py-1.5 text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={() => save(provider)}
          disabled={saving === provider}
          className="self-start px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving === provider ? "Saving…" : saved === provider ? "Saved!" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">Payment Handles & QR Codes</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Configure Venmo and Zelle payment information. Staff will see this at the top of the sales page for quick reference.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <ProviderCard
          provider="venmo"
          state={venmo}
          setState={setVenmo}
          fileRef={venmoFileRef}
        />
        <ProviderCard
          provider="zelle"
          state={zelle}
          setState={setZelle}
          fileRef={zelleFileRef}
        />
      </div>
    </div>
  );
}
