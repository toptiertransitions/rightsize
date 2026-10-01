"use client";

import { useState, useEffect, useCallback } from "react";
import type { PartnerCategory } from "@/lib/types";
import type { PartnerProfile } from "@/lib/partners/types";

interface DocumentItem {
  fileKey: string;
  originalFileName: string;
  partnerName: string;
  partnerCompanyName?: string;
  note?: string;
  matchedVendorId?: string;
  uploadedAt: string;
}

interface Props {
  tenantId: string;
  canMatch: boolean;
  selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>>;
}

// Shows documents a referring Partner has shared for this project. Separate
// from the vendor marketplace below — a referring Partner (CRM contact) and
// a selected marketplace vendor are unrelated systems, so this list exists
// on its own, with an optional link to connect a document's sender to one
// of the client's selected team members (if that partner is also on the
// team). See PartnerFilesSection for the matched-in view on the vendor card.
export function DocumentsSection({ tenantId, canMatch, selectedPartners }: Props) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?tenantId=${tenantId}`);
      const d = await res.json();
      setDocs(d.documents ?? []);
    } catch {
      setError("Couldn't load documents");
    } finally {
      setLoaded(true);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const teamOptions = (Object.entries(selectedPartners) as [PartnerCategory, PartnerProfile][]).map(([category, partner]) => ({
    category,
    partnerId: partner.id,
    vendorName: partner.vendorName,
  }));

  const handleMatch = async (fileKey: string, matchedVendorId: string | null) => {
    setSavingKey(fileKey);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${fileKey}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchedVendorId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't update match");
      }
      setDocs((prev) => prev.map((d) => (d.fileKey === fileKey ? { ...d, matchedVendorId: matchedVendorId ?? undefined } : d)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update match");
    } finally {
      setSavingKey(null);
    }
  };

  if (!loaded || docs.length === 0) return null;

  const byPartner = new Map<string, DocumentItem[]>();
  for (const doc of docs) {
    const key = `${doc.partnerName}|${doc.partnerCompanyName ?? ""}`;
    byPartner.set(key, [...(byPartner.get(key) ?? []), doc]);
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 whitespace-nowrap">Documents</h2>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="space-y-4">
        {[...byPartner.entries()].map(([key, items]) => {
          const [partnerName, companyName] = key.split("|");
          return (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">
                {partnerName}{companyName ? <span className="text-gray-400 font-normal"> &middot; {companyName}</span> : null}
              </p>
              <div className="mt-2 space-y-2.5">
                {items.map((doc) => (
                  <div key={doc.fileKey}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <a
                        href={`/api/documents/${doc.fileKey}/download`}
                        className="flex-1 min-w-0 text-sm text-forest-600 hover:text-forest-800 hover:underline truncate"
                        title={doc.originalFileName}
                      >
                        {doc.originalFileName}
                      </a>
                      <span className="text-xs text-gray-400 shrink-0">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      {canMatch && teamOptions.length > 0 && (
                        <select
                          value={doc.matchedVendorId ?? ""}
                          disabled={savingKey === doc.fileKey}
                          onChange={(e) => handleMatch(doc.fileKey, e.target.value || null)}
                          className="h-8 text-xs rounded-lg border border-gray-200 bg-white px-2 shrink-0 disabled:opacity-50"
                        >
                          <option value="">Not linked</option>
                          {teamOptions.map((o) => (
                            <option key={o.partnerId} value={o.partnerId}>Link to {o.vendorName}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {doc.note && <p className="mt-1 text-xs text-gray-500 italic">&ldquo;{doc.note}&rdquo;</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
