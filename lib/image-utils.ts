/**
 * Client-side image preparation utility.
 * Converts HEIC/HEIF → JPEG via the browser canvas API and resizes large images
 * before upload. This avoids relying on server-side libheif (unavailable on Vercel).
 *
 * Works in all browsers for JPEG/PNG/WebP. For HEIC:
 *   - iOS Safari can decode HEIC natively in <img>, so canvas conversion works.
 *   - Chrome/Firefox cannot decode HEIC natively; the catch block returns the
 *     original file (server-side sharp will attempt it, or the user sees an error).
 *
 * Import ONLY in client components ("use client").
 */

const MAX_UPLOAD_DIM = 1800;
const UPLOAD_QUALITY = 0.88;

export async function prepareImageForUpload(file: File): Promise<File> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  // Pass non-image files (PDFs, etc.) through unchanged.
  if (!file.type.startsWith("image/") && !isHeic) return file;

  try {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img load failed"));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    // Scale down if either dimension exceeds MAX_UPLOAD_DIM
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

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        UPLOAD_QUALITY
      )
    );

    // Rename .heic/.heif extension to .jpg; also normalise any other extension.
    const safeName = file.name
      .replace(/\.(heic|heif)$/i, ".jpg")
      .replace(/\.[^.]+$/, ".jpg");

    return new File([blob], safeName, { type: "image/jpeg" });
  } catch {
    // Fallback: return the original file and let the server attempt conversion.
    return file;
  }
}
