"use client";

import { useState, useRef, useEffect } from "react";

interface SigningClientProps {
  token: string;
}

export function SigningClient({ token }: SigningClientProps) {
  const [method, setMethod] = useState<"draw" | "type">("draw");
  const [signerName, setSignerName] = useState("");
  const [typedName, setTypedName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // Drawing handlers
  const getPos = (e: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const pos = getPos(e, canvas);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHasDrawn(true);
    };

    const onUp = (e: PointerEvent) => {
      isDrawing.current = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!signerName.trim()) { setError("Full name is required"); return; }
    if (method === "draw" && !hasDrawn) { setError("Please draw your signature"); return; }
    if (method === "type" && !typedName.trim()) { setError("Please type your name to sign"); return; }

    setSubmitting(true); setError("");
    try {
      let signatureData = "";
      if (method === "draw") {
        signatureData = canvasRef.current?.toDataURL("image/png") ?? "";
      } else {
        signatureData = typedName.trim();
      }

      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureData, method, signerName: signerName.trim() }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to sign");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error submitting signature");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800 mb-2">Agreement Signed!</h3>
        <p className="text-sm text-green-700 leading-relaxed">
          Thank you, <strong>{signerName}</strong>. Your signature has been recorded and the Top Tier Transitions team has been notified.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Sign Agreement</h2>

      {/* Full name */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Your full legal name"
          className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
        />
      </div>

      {/* Method tabs */}
      <div className="flex gap-2 mb-4">
        {(["draw", "type"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`h-9 px-4 rounded-xl text-sm font-medium transition-colors ${
              method === m
                ? "bg-gray-900 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {m === "draw" ? "Draw Signature" : "Type Name"}
          </button>
        ))}
      </div>

      {/* Draw tab */}
      {method === "draw" && (
        <div className="mb-5">
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            <canvas
              ref={canvasRef}
              width={560}
              height={150}
              className="w-full block"
              style={{ touchAction: "none", cursor: "crosshair" }}
            />
          </div>
          <button
            onClick={clearCanvas}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Type tab */}
      {method === "type" && (
        <div className="mb-5">
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your full name"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 mb-3"
          />
          {typedName && (
            <div
              className="p-3 bg-gray-50 rounded-xl border border-gray-200"
              style={{ fontFamily: "'Dancing Script', cursive", fontSize: "32px", color: "#1a1a1a" }}
            >
              {typedName}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-12 rounded-xl bg-forest-600 text-white font-semibold hover:bg-forest-700 transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Sign & Submit Agreement"}
      </button>

      <p className="text-xs text-gray-400 mt-3 text-center">
        By signing, you agree to the terms of the service agreement above.
      </p>
    </div>
  );
}
