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
  } = {}
): Promise<FileUploadResult> {
  const folder = options.folder || `rightsize/${options.tenantId || "shared"}/files`;
  const mime = options.mimeType || "application/octet-stream";

  // Default non-image/video MIME types to "raw" so Cloudinary stores and
  // serves them as-is (avoids misclassification of PDFs as images).
  const resourceType: "raw" | "image" | "video" | "auto" =
    options.resourceType ??
    (mime.startsWith("image/") || mime.startsWith("video/") ? "auto" : "raw");

  const result = await cloudinary.uploader.upload(
    `data:${mime};base64,${buffer.toString("base64")}`,
    {
      folder,
      resource_type: resourceType,
      ...(options.publicId ? { public_id: options.publicId } : {}),
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
