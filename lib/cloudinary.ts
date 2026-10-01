import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
}

export async function uploadImage(
  fileData: string | Buffer,
  options: {
    folder?: string;
    tenantId?: string;
    publicId?: string;
    mimeType?: string;
  } = {}
): Promise<UploadResult> {
  const folder = options.folder || `rightsize/${options.tenantId || "shared"}`;
  const mime = options.mimeType && options.mimeType.startsWith("image/") ? options.mimeType : "image/jpeg";

  const result = await cloudinary.uploader.upload(
    typeof fileData === "string" ? fileData : `data:${mime};base64,${fileData.toString("base64")}`,
    {
      folder,
      public_id: options.publicId,
      transformation: [
        { quality: "auto:good" },
        { fetch_format: "auto" },
        { width: 1200, height: 1200, crop: "limit" },
      ],
    }
  );

  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
  };
}

export async function uploadPng(buffer: Buffer, options: { tenantId?: string } = {}): Promise<UploadResult> {
  const folder = `rightsize/${options.tenantId || "shared"}`;
  const result = await cloudinary.uploader.upload(
    `data:image/png;base64,${buffer.toString("base64")}`,
    { folder, transformation: [{ width: 1200, height: 1200, crop: "limit" }] }
  );
  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
  };
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

export interface FileUploadResult extends UploadResult {
  resourceType: string;
}

export async function uploadFile(
  buffer: Buffer,
  options: {
    folder?: string;
    tenantId?: string;
    mimeType?: string;
    resourceType?: "raw" | "image" | "video" | "auto";
    publicId?: string;
    originalFileName?: string;
  } = {}
): Promise<FileUploadResult> {
  const folder = options.folder || `rightsize/${options.tenantId || "shared"}/files`;
  const mime = options.mimeType || "application/octet-stream";

  // Default non-image/video MIME types to "raw" so Cloudinary stores and
  // serves them as-is (avoids misclassification of PDFs as images).
  const resourceType: "raw" | "image" | "video" | "auto" =
    options.resourceType ??
    (mime.startsWith("image/") || mime.startsWith("video/") ? "auto" : "raw");

  // Build a meaningful public_id from the original filename so the Cloudinary
  // URL and downloaded file retain the original name and extension.
  let resolvedPublicId: string | undefined = options.publicId;
  if (!resolvedPublicId && options.originalFileName) {
    const nameWithoutExt = options.originalFileName.replace(/\.[^.]+$/, "");
    const safe = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 80);
    resolvedPublicId = `${folder}/${Date.now()}_${safe}`;
  }

  const result = await cloudinary.uploader.upload(
    `data:${mime};base64,${buffer.toString("base64")}`,
    {
      folder: resolvedPublicId ? undefined : folder,
      resource_type: resourceType,
      ...(resolvedPublicId ? { public_id: resolvedPublicId } : {}),
    }
  );

  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    width: result.width ?? 0,
    height: result.height ?? 0,
    format: result.format ?? "",
    resourceType: result.resource_type,
  };
}

export async function deleteFile(publicId: string, resourceType: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType as "image" | "raw" | "video",
  });
}

// ─── Private/authenticated delivery (Documents feature) ──────────────────────
// Uses Cloudinary's "authenticated" delivery type (distinct from the public
// uploads above) so the asset is never servable via a guessable/public URL —
// every download requires a freshly-signed, short-lived API URL.
export async function uploadAuthenticatedFile(
  buffer: Buffer,
  options: { publicId: string; mimeType: string }
): Promise<{ publicId: string }> {
  const result = await cloudinary.uploader.upload(
    `data:${options.mimeType};base64,${buffer.toString("base64")}`,
    {
      public_id: options.publicId,
      resource_type: "raw",
      type: "authenticated",
    }
  );
  return { publicId: result.public_id };
}

export function getAuthenticatedDownloadUrl(publicId: string, format: string, expiresInSeconds = 90): string {
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

export async function deleteAuthenticatedFile(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: "raw", type: "authenticated" });
}

export function getOptimizedUrl(
  publicId: string,
  options: { width?: number; height?: number } = {}
): string {
  return cloudinary.url(publicId, {
    secure: true,
    quality: "auto:good",
    fetch_format: "auto",
    ...(options.width && { width: options.width }),
    ...(options.height && { height: options.height }),
    crop: "fill",
  });
}
