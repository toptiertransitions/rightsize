import { randomUUID } from "crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { getRecentDeniedCountForActor } from "./airtable";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/heic",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/heic": "heic",
};

export function generateFileKey(): string {
  return randomUUID();
}

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

// Strips the name down to a safe slug — no path separators, no unicode
// tricks, no double extensions that could confuse a downstream content-type
// sniff. The real extension is always derived from the verified MIME type
// (extensionForMimeType), never trusted from the filename itself.
export function sanitizeFileName(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? "file";
  const nameOnly = base.replace(/\.[^.]+$/, "");
  const slug = nameOnly
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return slug || "document";
}

interface SignatureCheck {
  mimeType: string | null;
  blocked: boolean;
  reason?: string;
}

// Verifies the file's actual bytes match a real, allowed type — never trusts
// the browser-supplied Content-Type or the filename extension. Explicitly
// rejects SVG/HTML/script content even if mislabeled as something benign,
// since those are the classic "image" upload that turns into stored XSS.
function detectFileSignature(buffer: Buffer): SignatureCheck {
  const head = buffer.subarray(0, 512);
  const asciiHead = head.toString("latin1").toLowerCase();

  if (
    asciiHead.includes("<svg") ||
    asciiHead.includes("<!doctype html") ||
    asciiHead.includes("<html") ||
    asciiHead.includes("<script") ||
    asciiHead.includes("<?php")
  ) {
    return { mimeType: null, blocked: true, reason: "File content matches a blocked type (HTML/SVG/script)." };
  }

  if (buffer.length < 4) return { mimeType: null, blocked: true, reason: "File too small to verify." };

  // PDF: "%PDF"
  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return { mimeType: "application/pdf", blocked: false };
  }

  // PNG: 89 50 4E 47
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return { mimeType: "image/png", blocked: false };
  }

  // JPEG: FF D8 FF
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { mimeType: "image/jpeg", blocked: false };
  }

  // HEIC/HEIF: "ftyp" at offset 4, with a heic/heix/mif1/msf1 brand
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1").toLowerCase();
    if (["heic", "heix", "mif1", "msf1", "heim", "heis"].includes(brand)) {
      return { mimeType: "image/heic", blocked: false };
    }
  }

  // Legacy OLE2 container: .doc/.xls (D0 CF 11 E0 A1 B1 1A E1)
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return { mimeType: "application/msword", blocked: false }; // could be .xls too; caller's declared mime disambiguates
  }

  // DOCX/XLSX: zip container (PK\x03\x04) — modern Office formats
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return { mimeType: "zip-office", blocked: false }; // caller's declared mime disambiguates docx vs xlsx
  }

  return { mimeType: null, blocked: false, reason: "Unrecognized file type." };
}

export interface ValidationResult {
  ok: boolean;
  mimeType?: string;
  reason?: string;
}

// The single gate every upload must pass: declared type must be on the
// allowlist AND the actual bytes must match a real file of a type we allow.
export function validateUpload(buffer: Buffer, declaredMimeType: string, size: number): ValidationResult {
  if (size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.` };
  }
  if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    return { ok: false, reason: "File type not allowed." };
  }

  const sig = detectFileSignature(buffer);
  if (sig.blocked) {
    return { ok: false, reason: sig.reason ?? "File content is not allowed." };
  }

  const isOfficeZip = sig.mimeType === "zip-office" &&
    (declaredMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      declaredMimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const isLegacyOffice = sig.mimeType === "application/msword" &&
    (declaredMimeType === "application/msword" || declaredMimeType === "application/vnd.ms-excel");
  const isDirectMatch = sig.mimeType === declaredMimeType;

  if (!isOfficeZip && !isLegacyOffice && !isDirectMatch) {
    return { ok: false, reason: "File content doesn't match its declared type." };
  }

  return { ok: true, mimeType: declaredMimeType };
}

// ─── VirusTotal scanning ───────────────────────────────────────────────────────
const VT_BASE = "https://www.virustotal.com/api/v3";
const VT_POLL_INTERVAL_MS = 3000;
const VT_MAX_WAIT_MS = 45000;

export interface ScanResult {
  completed: boolean;
  clean: boolean;
  detail: string;
}

export async function scanWithVirusTotal(buffer: Buffer, fileName: string): Promise<ScanResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    return { completed: false, clean: false, detail: "VIRUSTOTAL_API_KEY not configured" };
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), fileName);

  const uploadRes = await fetch(`${VT_BASE}/files`, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: form,
  });
  if (!uploadRes.ok) {
    return { completed: false, clean: false, detail: `VirusTotal upload failed: ${uploadRes.status}` };
  }
  const uploadBody = await uploadRes.json();
  const analysisId = uploadBody?.data?.id;
  if (!analysisId) {
    return { completed: false, clean: false, detail: "VirusTotal did not return an analysis id" };
  }

  const deadline = Date.now() + VT_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const analysisRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (analysisRes.ok) {
      const analysisBody = await analysisRes.json();
      const status = analysisBody?.data?.attributes?.status;
      if (status === "completed") {
        const stats = analysisBody?.data?.attributes?.stats ?? {};
        const malicious = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
        return {
          completed: true,
          clean: malicious === 0,
          detail: malicious > 0 ? `${malicious} engines flagged this file` : "Clean",
        };
      }
    }
    await new Promise((r) => setTimeout(r, VT_POLL_INTERVAL_MS));
  }

  return { completed: false, clean: false, detail: "VirusTotal scan did not complete in time" };
}

// ─── Rate limiting / abuse controls ────────────────────────────────────────────
function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

let burstLimiter: Ratelimit | null = null;
let partnerDailyLimiter: Ratelimit | null = null;
let projectDailyLimiter: Ratelimit | null = null;

function getLimiters(): { burst: Ratelimit; partnerDaily: Ratelimit; projectDaily: Ratelimit } | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!burstLimiter) {
    burstLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: "doc-upload-burst" });
    partnerDailyLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 d"), prefix: "doc-upload-partner-day" });
    projectDailyLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 d"), prefix: "doc-upload-project-day" });
  }
  return { burst: burstLimiter!, partnerDaily: partnerDailyLimiter!, projectDaily: projectDailyLimiter! };
}

export async function checkUploadRateLimit(
  partnerContactId: string,
  tenantId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const limiters = getLimiters();
  if (!limiters) return { allowed: true }; // fail open only when Upstash isn't configured at all

  const [burst, partnerDay, projectDay] = await Promise.all([
    limiters.burst.limit(partnerContactId),
    limiters.partnerDaily.limit(partnerContactId),
    limiters.projectDaily.limit(tenantId),
  ]);

  if (!burst.success) return { allowed: false, reason: "Too many uploads in a short time. Please wait a few minutes." };
  if (!partnerDay.success) return { allowed: false, reason: "Daily upload limit reached for your account." };
  if (!projectDay.success) return { allowed: false, reason: "Daily upload limit reached for this project." };

  return { allowed: true };
}

// Dedupes staff alerts so one burst of denied attempts sends a single email,
// not one per attempt.
export async function shouldSendAbuseAlert(actorUserId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // no dedup store available — let the caller decide, better to alert than stay silent
  const key = `doc-abuse-alert-sent:${actorUserId}`;
  const result = await redis.set(key, "1", { nx: true, ex: 3600 });
  return result === "OK";
}

const DENIED_ALERT_THRESHOLD = 3;

// Call this AFTER logging a "Denied" activity entry. Alerts staff once this
// actor has hit 3+ denied attempts within the last hour, deduped so a burst
// sends one email, not one per attempt.
export async function shouldAlertOnRepeatedDenials(actorUserId: string): Promise<boolean> {
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentDenials = await getRecentDeniedCountForActor(actorUserId, sinceIso).catch(() => 0);
  if (recentDenials < DENIED_ALERT_THRESHOLD) return false;
  return shouldSendAbuseAlert(actorUserId);
}
