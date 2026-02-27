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
  } = {}
): Promise<UploadResult> {
  const folder = options.folder || `rightsize/${options.tenantId || "shared"}`;

  const result = await cloudinary.uploader.upload(
    typeof fileData === "string" ? fileData : `data:image/jpeg;base64,${fileData.toString("base64")}`,
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
