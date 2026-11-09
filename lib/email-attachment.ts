// Normalizes a fetched file into an email attachment with a correct MIME type and file extension.
// Cloudinary "raw" uploads often have no extension in the URL and are served as
// application/octet-stream, so recipients' mail clients can't preview or open them.
// The real type is taken from the file's leading bytes when it's recognizable.

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

function extOf(name: string): string | null {
  const m = name.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : null;
}

function sniffExt(data: Buffer): string | null {
  const head = data.subarray(0, 12);
  if (head.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export function mimeTypeFromName(filename: string): string | null {
  const ext = extOf(filename);
  return ext ? (MIME_BY_EXT[ext] ?? null) : null;
}

export function buildEmailAttachment(
  data: Buffer,
  name: string,
  headerType?: string | null,
): { data: Buffer; name: string; mimeType: string } {
  // Older broadcasts saved names like "Title./cloud/raw/upload/..." (a URL path used as the extension)
  const base = name.includes("./") ? name.slice(0, name.indexOf("./")) : name;
  // Characters like : / \ break filenames on Windows and in some mail clients
  let clean = base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "attachment";
  const sniffed = sniffExt(data);
  const named = extOf(clean);
  if (sniffed && named !== sniffed && !(sniffed === "jpg" && named === "jpeg")) {
    clean = `${named && !MIME_BY_EXT[named] ? clean : clean.replace(/\.[a-z0-9]{2,5}$/i, "")}.${sniffed}`;
  }
  const mimeType =
    mimeTypeFromName(clean) ||
    (headerType && headerType !== "application/octet-stream" ? headerType : null) ||
    "application/octet-stream";
  return { data, name: clean, mimeType };
}
