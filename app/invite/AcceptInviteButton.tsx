"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  tenantId?: string;
  vendorId?: string;
}

export function AcceptInviteButton({ token, tenantId, vendorId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const attempted = useRef(false);

  const handleAccept = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invitation.");
        return;
      }
      if (vendorId || data.redirect === "/vendor") {
        router.push("/vendor");
      } else {
        router.push(`/rooms?tenantId=${tenantId}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, tenantId, vendorId, router]);

  // Reaching this component already means: valid unexpired invite, signed
  // in, not the inviter — clear intent to join. Accept automatically
  // instead of making someone click twice right after they just clicked
  // "Create your account to accept" and finished signing up. The manual
  // button below only appears as a retry if the automatic attempt fails.
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    handleAccept();
  }, [handleAccept]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 text-center">{error}</p>
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex items-center justify-center w-full h-11 px-5 bg-forest-600 text-white rounded-xl font-medium text-sm hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2.5 py-2 text-sm font-medium text-gray-500">
      <svg className="animate-spin h-4 w-4 text-forest-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Setting up your access…
    </div>
  );
}
