"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Room, ItemAnalysis, ItemCondition, SizeClass, FragilityLevel, ItemUseType, PrimaryRoute, ItemPhoto } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { prepareImageForUpload } from "@/lib/image-utils";

interface NewItemClientProps {
  tenantId: string;
  rooms: Room[];
  isTTT?: boolean;
}

type Step = "photo" | "analyzing" | "review" | "saving" | "done";

// Re-export for local convenience
type PhotoMeta = ItemPhoto;

const BLANK_ANALYSIS: Partial<ItemAnalysis> = {
  item_name: "",
  category: "",
  condition: "Good",
  condition_notes: "",
  size_class: "Fits in Car-SUV",
  fragility: "Not Fragile",
  item_type: "Daily Use",
  value_low: 0,
  value_mid: 0,
  value_high: 0,
  primary_route: "Keep",
  route_reasoning: "",
  consignment_category: "",
  listing_title_ebay: "",
  listing_description_ebay: "",
  listing_fb: "",
  listing_offerup: "",
  staff_tips: "",
};


export function NewItemClient({ tenantId, rooms, isTTT = true }: NewItemClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addMorePhotosRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("photo");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // photos[0] = primary (used for AI analysis); photos[1..] = additional
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [photoDragIdx, setPhotoDragIdx] = useState<number | null>(null);
  const [photoDropIdx, setPhotoDropIdx] = useState<number | null>(null);
  const [uploadingMore, setUploadingMore] = useState(false);
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<Partial<ItemAnalysis>>({});
  const [manualMode, setManualMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [error, setError] = useState<string>("");
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);
  const [removeBg, setRemoveBg] = useState(false);
  const [bgRemoving, setBgRemoving] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      setError("Please select an image file.");
      return;
    }
    const converted = await prepareImageForUpload(file);
    setPhotoFile(converted);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(converted);
    setError("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleAnalyze = async () => {
    if (!photoFile) return;
    setStep("analyzing");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      formData.append("tenantId", tenantId);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
        if (res.status === 413) throw new Error("Photo is too large to upload. Please use a smaller image.");
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      // Store primary photo; additional photos can be added in review step
      let primary: PhotoMeta = {
        url: (data.analysis as Record<string, string>)._photoUrl || "",
        publicId: (data.analysis as Record<string, string>)._photoPublicId || "",
      };
      // Optionally remove background from primary photo
      if (removeBg && primary.url) {
        setBgRemoving(true);
        try {
          const bgRes = await fetch("/api/remove-background", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: primary.url, tenantId }),
          });
          if (bgRes.ok) {
            const bgData = await bgRes.json();
            primary = { url: bgData.photoUrl, publicId: bgData.photoPublicId };
          }
        } catch {
          // silent fail — use original photo
        } finally {
          setBgRemoving(false);
        }
      }
      setPhotos(prev => prev.length ? [primary, ...prev.slice(1)] : [primary]);
      setAnalysis(data.analysis);
      setEditedAnalysis(data.analysis);
      setManualMode(false);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("photo");
    }
  };

  const handleManualOverride = () => {
    // Clear all AI-provided values, keep uploaded photo
    setAnalysis(null);
    setEditedAnalysis({ ...BLANK_ANALYSIS });
    setManualMode(true);
  };

  const handleManualEntry = async () => {
    setError("");
    setUploading(true);
    try {
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        formData.append("tenantId", tenantId);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          if (res.status === 413) throw new Error("Photo is too large to upload. Please use a smaller image.");
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Photo upload failed");
        }
        const data = await res.json();
        const primary: PhotoMeta = { url: data.photoUrl, publicId: data.photoPublicId };
        setPhotos(prev => prev.length ? [primary, ...prev.slice(1)] : [primary]);
      }
      setAnalysis(null);
      setEditedAnalysis({ ...BLANK_ANALYSIS });
      setManualMode(true);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddMorePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 10 - photos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingMore(true);
    setError("");
    try {
      const uploaded: PhotoMeta[] = [];
      for (const rawFile of toUpload) {
        const file = await prepareImageForUpload(rawFile);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", tenantId);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          if (res.status === 413) throw new Error("Photo is too large to upload. Please use a smaller image.");
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
        const data = await res.json();
        uploaded.push({ url: data.photoUrl, publicId: data.photoPublicId });
      }
      setPhotos(prev => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingMore(false);
      if (addMorePhotosRef.current) addMorePhotosRef.current.value = "";
    }
  };

  const merged = { ...(analysis ?? {}), ...editedAnalysis } as ItemAnalysis;

  const handleSave = async () => {
    setStep("saving");
    setError("");
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          roomId: selectedRoomId || undefined,
          photos: photos.length ? photos : undefined,
          photoUrl: photos[0]?.url || undefined,
          photoPublicId: photos[0]?.publicId || undefined,
          itemName: merged.item_name || "Untitled Item",
          category: merged.category,
          condition: merged.condition,
          conditionNotes: merged.condition_notes,
          sizeClass: merged.size_class,
          fragility: merged.fragility,
          itemType: merged.item_type,
          valueLow: merged.value_low,
          valueMid: merged.value_mid,
          valueHigh: merged.value_high,
          primaryRoute: merged.primary_route,
          routeReasoning: merged.route_reasoning,
          consignmentCategory: merged.consignment_category,
          listingTitleEbay: merged.listing_title_ebay,
          listingDescriptionEbay: merged.listing_description_ebay,
          listingFb: merged.listing_fb,
          listingOfferup: merged.listing_offerup,
          staffTips: merged.staff_tips,
          quantity: merged.quantity ?? 1,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save item");
      }
      setStep("done");
      setTimeout(() => router.push(`/catalog?tenantId=${tenantId}`), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setStep("review");
    }
  };

  const update = (field: keyof ItemAnalysis, value: string | number) => {
    setEditedAnalysis((prev) => ({ ...prev, [field]: value }));
  };

  if (step === "done") {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <div className="w-16 h-16 bg-forest-100 rounded-full flex items-center justify-center mb-4 text-3xl">✅</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Item saved!</h2>
        <p className="text-gray-500">Redirecting to catalog...</p>
      </div>
    );
  }

  if (step === "analyzing") {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <LoadingSpinner size="lg" className="mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {bgRemoving ? "Removing background..." : "Analyzing item..."}
        </h2>
        <p className="text-gray-500 max-w-xs">
          {bgRemoving
            ? "AI is removing the background from your photo."
            : "Claude AI is examining the photo to identify the item, estimate value, and suggest the best route."}
        </p>
      </div>
    );
  }

  if (step === "saving") {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <LoadingSpinner size="lg" className="mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Saving to catalog...</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Photo Step */}
      {step === "photo" && (
        <Card>
          <CardContent>
            <h2 className="font-semibold text-gray-900 mb-4">Upload Item Photo</h2>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={`border-2 border-dashed rounded-2xl transition-all ${
                photoPreview ? "border-forest-400" : "border-gray-300"
              }`}
            >
              {photoPreview ? (
                <div className="relative aspect-video rounded-xl overflow-hidden">
                  <Image src={photoPreview} alt="Preview" fill className="object-contain" />
                </div>
              ) : (
                <div className="py-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-gray-400 text-sm">Drag & drop or use buttons below</p>
                </div>
              )}
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 h-14 rounded-2xl border-2 border-gray-200 hover:border-forest-400 hover:bg-forest-50 transition-all text-sm font-medium text-gray-700">
                <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 h-14 rounded-2xl border-2 border-gray-200 hover:border-forest-400 hover:bg-forest-50 transition-all text-sm font-medium text-gray-700">
                <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose from Library
              </button>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex gap-3">
              {photoPreview && (
                <Button variant="secondary" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="flex-1">
                  Change Photo
                </Button>
              )}
              <Button onClick={handleAnalyze} disabled={!photoFile || uploading} className="flex-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Analyze with AI
              </Button>
              <Button variant="secondary" onClick={handleManualEntry} loading={uploading} disabled={!!(photoFile && uploading)} className="flex-1">
                Enter Manually
              </Button>
            </div>

            {/* Remove background toggle */}
            <div className="mt-3 flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={removeBg}
                onClick={() => setRemoveBg(v => !v)}
                className={`relative inline-flex w-9 h-5 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${removeBg ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span
                  className={`inline-block w-4 h-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${removeBg ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
              <span className="text-sm text-gray-600">Remove background with AI</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Step */}
      {step === "review" && (
        <>
          {/* Summary / photo */}
          <Card>
            <CardContent>
              <div className="flex gap-4">
                {/* Show primary photo from Cloudinary if uploaded, else local preview */}
                {(photos[0]?.url || photoPreview) && (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                    <Image src={photos[0]?.url || photoPreview!} alt="Item" fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {manualMode ? (
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Enter Details Manually</h2>
                      <p className="text-sm text-gray-400 mt-0.5">Fill in the fields below and save.</p>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 truncate">{merged.item_name}</h2>
                      <p className="text-sm text-gray-500">{merged.category} · {merged.condition}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-forest-700">
                          {merged.value_mid > 0 ? formatCurrency(merged.value_mid) : "—"}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({formatCurrency(merged.value_low)} – {formatCurrency(merged.value_high)})
                        </span>
                      </div>
                      <div className="mt-1">
                        <span className="text-sm font-medium text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full">
                          → {merged.primary_route}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Override button — only shown when AI has run */}
              {!manualMode && (
                <div className="mt-4 pt-4 border-t border-cream-100">
                  <button
                    onClick={handleManualOverride}
                    className="text-sm text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Override & Input Manually
                  </button>
                  <p className="text-xs text-gray-400 mt-1 ml-5.5">
                    Clears all AI-provided values so you can enter correct details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Photos */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">
                  Photos
                  {photos.length > 0 && <span className="ml-1 text-gray-400 font-normal">{photos.length}/10</span>}
                </h3>
                {photos.length < 10 && (
                  <button
                    type="button"
                    onClick={() => addMorePhotosRef.current?.click()}
                    disabled={uploadingMore}
                    className="text-xs text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50"
                  >
                    {uploadingMore ? "Uploading…" : "+ Add Photo"}
                  </button>
                )}
              </div>
              <input
                ref={addMorePhotosRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleAddMorePhotos(e.target.files)}
              />
              {photos.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addMorePhotosRef.current?.click()}
                  disabled={uploadingMore}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-forest-300 hover:bg-forest-50 transition-colors text-gray-400 hover:text-forest-600 text-sm disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Add photos (optional, up to 10)
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((photo, i) => (
                      <div
                        key={photo.url}
                        draggable
                        onDragStart={() => setPhotoDragIdx(i)}
                        onDragOver={e => { e.preventDefault(); setPhotoDropIdx(i); }}
                        onDragLeave={() => setPhotoDropIdx(null)}
                        onDrop={e => {
                          e.preventDefault();
                          if (photoDragIdx === null || photoDragIdx === i) return;
                          const arr = [...photos];
                          const [moved] = arr.splice(photoDragIdx, 1);
                          arr.splice(i, 0, moved);
                          setPhotos(arr);
                          setPhotoDragIdx(null);
                          setPhotoDropIdx(null);
                        }}
                        onDragEnd={() => { setPhotoDragIdx(null); setPhotoDropIdx(null); }}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 cursor-grab active:cursor-grabbing border-2 transition-all ${
                          photoDropIdx === i ? "border-forest-400 scale-105" : i === 0 ? "border-forest-300" : "border-transparent"
                        }`}
                      >
                        <Image src={photo.url} alt={`Photo ${i + 1}`} fill className="object-cover" />
                        {/* Primary star */}
                        <button
                          type="button"
                          title={i === 0 ? "Primary photo" : "Set as primary"}
                          onClick={() => {
                            if (i === 0) return;
                            const arr = [...photos];
                            const [moved] = arr.splice(i, 1);
                            arr.unshift(moved);
                            setPhotos(arr);
                          }}
                          className="absolute top-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/40 hover:bg-black/60 transition-colors"
                        >
                          <svg className={`w-3 h-3 ${i === 0 ? "text-yellow-300 fill-yellow-300" : "text-white"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                        {/* Remove */}
                        <button
                          type="button"
                          title="Remove photo"
                          onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/40 hover:bg-red-500 transition-colors text-white"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {photos.length < 10 && (
                      <button
                        type="button"
                        onClick={() => addMorePhotosRef.current?.click()}
                        disabled={uploadingMore}
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 hover:border-forest-300 hover:bg-forest-50 flex items-center justify-center text-gray-400 hover:text-forest-500 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {uploadingMore ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Drag to reorder · ★ = primary photo used for AI analysis</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Editable Fields */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4">
                {manualMode ? "Item Details" : "Review & Edit Details"}
              </h3>
              <div className="space-y-4">
                <Input label="Item Name" value={merged.item_name ?? ""} onChange={(e) => update("item_name", e.target.value)} />
                <Input label="Category" value={merged.category ?? ""} onChange={(e) => update("category", e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Condition" value={merged.condition ?? "Good"}
                    onChange={(e) => update("condition", e.target.value as ItemCondition)}
                    options={[
                      { value: "Excellent", label: "Excellent" },
                      { value: "Good", label: "Good" },
                      { value: "Fair", label: "Fair" },
                      { value: "Poor", label: "Poor" },
                      { value: "For Parts", label: "For Parts" },
                    ]}
                  />
                  <Select label="Recommended Route" value={merged.primary_route ?? "Keep"}
                    onChange={(e) => update("primary_route", e.target.value as PrimaryRoute)}
                    options={[
                      { value: "Keep", label: "Keep" },
                      { value: "Family Keeping", label: "Family Keeping" },
                      ...( isTTT ? [{ value: "ProFoundFinds Consignment", label: "ProFoundFinds Consignment" }] : []),
                      { value: "FB/Marketplace", label: "FB/Marketplace" },
                      { value: "Online Marketplace", label: "eBay" },
                      { value: "Other Consignment", label: "Other Consignment Store" },
                      { value: "Donate", label: "Donate" },
                      { value: "Discard", label: "Discard" },
                      ...(isTTT ? [{ value: "Estate Sale", label: "Estate Sale" }] : []),
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Condition Notes</label>
                  <textarea
                    rows={2}
                    value={merged.condition_notes ?? ""}
                    onChange={(e) => update("condition_notes", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <Input label="Value Low ($)" type="number" inputMode="decimal"
                    value={merged.value_low || ""}
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onChange={(e) => update("value_low", e.target.value === "" ? 0 : Number(e.target.value))} />
                  <Input label="Target Value ($)" type="number" inputMode="decimal"
                    value={merged.value_mid || ""}
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onChange={(e) => update("value_mid", e.target.value === "" ? 0 : Number(e.target.value))} />
                  <Input label="Value High ($)" type="number" inputMode="decimal"
                    value={merged.value_high || ""}
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onChange={(e) => update("value_high", e.target.value === "" ? 0 : Number(e.target.value))} />
                </div>
                <Input label="Quantity" type="number" inputMode="numeric"
                  value={merged.quantity || ""}
                  placeholder="1"
                  onFocus={e => e.target.select()}
                  onChange={(e) => update("quantity", e.target.value === "" ? 1 : Math.max(1, Number(e.target.value)))} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Size" value={merged.size_class ?? "Fits in Car-SUV"}
                    onChange={(e) => update("size_class", e.target.value as SizeClass)}
                    options={[
                      { value: "Small & Shippable", label: "Small & Shippable" },
                      { value: "Fits in Car-SUV", label: "Fits in Car-SUV" },
                      { value: "Needs Movers", label: "Needs Movers" },
                    ]}
                  />
                  <Select label="Fragility" value={merged.fragility ?? "Not Fragile"}
                    onChange={(e) => update("fragility", e.target.value as FragilityLevel)}
                    options={[
                      { value: "Not Fragile", label: "Not Fragile" },
                      { value: "Somewhat Fragile", label: "Somewhat Fragile" },
                      { value: "Very Fragile", label: "Very Fragile" },
                    ]}
                  />
                </div>
                {rooms.length > 0 && (
                  <Select label="Room (optional)" value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    options={[
                      { value: "", label: "— No room —" },
                      ...rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.roomType})` })),
                    ]}
                  />
                )}
                <Input label="Consignment Category" value={merged.consignment_category ?? ""}
                  onChange={(e) => update("consignment_category", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Listings */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4">Marketplace Listings</h3>
              <div className="space-y-4">
                <Input label="eBay Title" value={merged.listing_title_ebay ?? ""}
                  onChange={(e) => update("listing_title_ebay", e.target.value)} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">eBay Description</label>
                  <textarea rows={3} value={merged.listing_description_ebay ?? ""}
                    onChange={(e) => update("listing_description_ebay", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Facebook Marketplace</label>
                  <textarea rows={2} value={merged.listing_fb ?? ""}
                    onChange={(e) => update("listing_fb", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">OfferUp</label>
                  <textarea rows={2} value={merged.listing_offerup ?? ""}
                    onChange={(e) => update("listing_offerup", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Staff Tips */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">Staff Notes</h3>
              <textarea rows={3} value={merged.staff_tips ?? ""}
                onChange={(e) => update("staff_tips", e.target.value)}
                placeholder="Internal notes for TTT staff…"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none" />
            </CardContent>
          </Card>

          {error && (
            <div ref={errorRef} className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pb-8">
            <Button type="button" variant="secondary"
              onClick={() => { setStep("photo"); setAnalysis(null); setEditedAnalysis({}); setManualMode(false); setPhotos([]); }}
              className="flex-1">
              Retake Photo
            </Button>
            <Button type="button" onClick={handleSave} disabled={uploadingMore} className="flex-1">
              Save to Catalog
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
