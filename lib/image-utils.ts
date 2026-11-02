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

function scaledSize(w: number, h: number): { w: number; h: number } {
  if (w <= MAX_UPLOAD_DIM && h <= MAX_UPLOAD_DIM) return { w, h };
  const scale = MAX_UPLOAD_DIM / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * True when the canvas came out a single flat color. Phone browsers that run out of
 * canvas memory (e.g. a 50MP photo) silently produce an all-black canvas instead of
 * throwing, so we check before uploading rather than trusting drawImage.
 */
function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 16;
    probe.height = 16;
    const ctx = probe.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    for (let i = 4; i < d.length; i += 4) {
      if (Math.abs(d[i] - d[0]) > 2 || Math.abs(d[i + 1] - d[1]) > 2 || Math.abs(d[i + 2] - d[2]) > 2) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function canvasToJpegBlob(
  source: HTMLImageElement | ImageBitmap,
  srcW: number,
  srcH: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const { w, h } = scaledSize(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // JPEG has no transparency — without a fill, transparent areas (common in floor plan
  // PNGs) turn black, and black linework on black is a solid black square.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  try {
    if (isBlankCanvas(canvas)) throw new Error("blank canvas");
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", UPLOAD_QUALITY)
    );
    return { blob, width: w, height: h };
  } finally {
    // Free the canvas memory right away — iOS Safari caps total canvas memory and
    // returns blank canvases once it's exhausted by earlier uploads.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Decode + resize. Prefers createImageBitmap with resize options, which decodes the
 * photo already downscaled (far less memory than a full-size <img> on phones), and
 * falls back to an <img> element where that isn't supported.
 */
async function resizeToJpeg(source: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  // The <img> gives us the dimensions (and throws for formats this browser can't read)
  const img = await loadImageElement(source);
  if (typeof createImageBitmap === "function") {
    try {
      const { w, h } = scaledSize(img.naturalWidth, img.naturalHeight);
      // Time-boxed: some browsers stall on resize options; the <img> path below still works
      const bitmap = await Promise.race([
        createImageBitmap(source, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("createImageBitmap timed out")), 4000)),
      ]);
      try {
        return await canvasToJpegBlob(bitmap, w, h);
      } finally {
        bitmap.close();
      }
    } catch { /* fall through to drawing the <img> directly */ }
  }
  return canvasToJpegBlob(img, img.naturalWidth, img.naturalHeight);
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
  let blob: Blob;
  try {
    ({ blob } = await resizeToJpeg(file));
  } catch {
    if (!isHeic) {
      // Resizing failed or came out blank. A browser-readable file that's already
      // small enough can go up as-is (Cloudinary resizes for display anyway).
      if (file.size <= MAX_UPLOAD_BYTES && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) return file;
      throw new Error(`Couldn't process "${file.name}" on this device. Try a smaller photo, or take a screenshot of it and upload that instead.`);
    }
    let converted: Blob | Blob[];
    try {
      const heic2any = (await import("heic2any")).default;
      converted = await heic2any({ blob: file, toType: "image/jpeg", quality: UPLOAD_QUALITY });
    } catch {
      throw new Error(`"${file.name}" is a HEIC photo this browser can't process automatically. Try converting it to JPEG first, or take a screenshot of it and upload that instead.`);
    }
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    try {
      ({ blob } = await resizeToJpeg(jpegBlob));
    } catch {
      throw new Error(`Couldn't process "${file.name}" on this device. Try converting it to JPEG first, or take a screenshot of it and upload that instead.`);
    }
  }

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
