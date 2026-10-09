// Signed cookies for community brands (server-only):
//  - rz_brand_preview: an admin's "View as" brand preview. Honored only for
//    TTTAdmin/TTTManager (lib/brands/resolve.ts); never changes data.
//  - rz_join_brand: the brand from a /join/[slug] link or a community code,
//    held for a short while so it can be attached when the account is created.
// Signed with the existing INVITE_SECRET (no new env var).
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export const PREVIEW_COOKIE = "rz_brand_preview";
export const JOIN_COOKIE = "rz_join_brand";
export const JOIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // a week to finish signing up

function secret(): string {
  const s = process.env.INVITE_SECRET;
  if (!s) throw new Error("INVITE_SECRET is not set");
  return s;
}

function sig(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** value -> "value.expiresAt.signature" */
export function signValue(value: string, maxAgeSeconds: number): string {
  const payload = `${value}.${Date.now() + maxAgeSeconds * 1000}`;
  return `${payload}.${sig(payload)}`;
}

/** Returns the value, or null if missing, tampered with, or expired. */
export function verifyValue(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  let expected: Buffer;
  try {
    expected = Buffer.from(sig(payload));
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const j = payload.lastIndexOf(".");
  const value = payload.slice(0, j);
  const exp = Number(payload.slice(j + 1));
  if (!value || !Number.isFinite(exp) || exp < Date.now()) return null;
  return value;
}
