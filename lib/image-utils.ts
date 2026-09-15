/**
 * Client-side image preparation utility.
 * Converts HEIC/HEIF → JPEG and resizes large images before upload, so
 * uploads stay under Vercel's ~4.5MB serverless request body limit (a
 * request over that limit is rejected by the platform before it ever
 * reaches our route handlers, as a plain-text 413 — not something our
 * server code can catch or convert to a friendly error).
 *
 * HEIC decoding:
 *   - iOS Safari can decode HEIC natively via <img>, so the fast path works.
 *   - Chrome/Firefox/Android cannot decode HEIC natively. We fall back to
 *     heic2any, a pure-JS/WASM decoder, dynamically imported only when
 *     needed. This avoids relying on server-side libheif (unavailable on
 *     Vercel) while still working in every browser, not just Safari.
 *
 * Import ONLY in client components ("use client").
 */

const MAX_UPLOAD_DIM = 1800;
const UPLOAD_QUALITY = 0.88;
// Stay comfortably under Vercel's ~4.5MB serverless request body limit,
// leaving headroom for multipart overhead and the other form fields.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function loadImageElement(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(source);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

function canvasToJpegBlob(img: HTMLImageElement): Promise<{ blob: Blob; width: number; height: number }> {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > MAX_UPLOAD_DIM || h > MAX_UPLOAD_DIM) {
    const scale = MAX_UPLOAD_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve({ blob: b, width: w, height: h }) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      UPLOAD_QUALITY
    )
  );
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  // Pass non-image files (PDFs, etc.) through unchanged.
  if (!file.type.startsWith("image/") && !isHeic) return file;

  // Get a source the browser can actually decode: the original file works
  // everywhere for JPEG/PNG/WebP, and for HEIC in Safari. Elsewhere, HEIC
  // needs to go through heic2any first.
  let img: HTMLImageElement;
  try {
    img = await loadImageElement(file);
  } catch {
    if (!isHeic) {
      throw new Error(`Couldn't read "${file.name}" — the file may be corrupted or an unsupported format.`);
    }
    let converted: Blob | Blob[];
    try {
      const heic2any = (await import("heic2any")).default;
      converted = await heic2any({ blob: file, toType: "image/jpeg", quality: UPLOAD_QUALITY });
    } catch {
      throw new Error(`"${file.name}" is a HEIC photo this browser can't process automatically. Try converting it to JPEG first, or take a screenshot of it and upload that instead.`);
    }
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    img = await loadImageElement(jpegBlob);
  }

  const { blob } = await canvasToJpegBlob(img);

  // Rename .heic/.heif extension to .jpg; also normalise any other extension.
  const safeName = file.name
    .replace(/\.(heic|heif)$/i, ".jpg")
    .replace(/\.[^.]+$/, ".jpg");

  const result = new File([blob], safeName, { type: "image/jpeg" });

  // Final safety net — if it's still too large after compression (e.g. an
  // extreme panorama), fail clearly now rather than let the upload hit
  // Vercel's platform-level 413 and surface a cryptic non-JSON error.
  if (result.size > MAX_UPLOAD_BYTES) {
    const mb = (result.size / (1024 * 1024)).toFixed(1);
    throw new Error(`"${file.name}" is still too large to upload after compression (${mb}MB). Try a smaller or lower-resolution photo.`);
  }

  return result;
}
