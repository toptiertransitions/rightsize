import { createHmac, timingSafeEqual } from "crypto";
import type { UserRole } from "./types";

export type InviteRole = Extract<UserRole, "Collaborator" | "Viewer" | "Owner">;

interface TenantInvitePayload {
  tenantId: string;
  role: InviteRole;
  invitedBy: string;
  expiresAt: number;
}

interface VendorInvitePayload {
  vendorId: string;
  invitedBy: string;
  expiresAt: number;
}

type InvitePayload = TenantInvitePayload | VendorInvitePayload;

export function isVendorInvite(payload: InvitePayload): payload is VendorInvitePayload {
  return "vendorId" in payload;
}

function getSecret(): string {
  const secret = process.env.INVITE_SECRET;
  if (!secret) throw new Error("INVITE_SECRET is not set");
  return secret;
}

function toBase64Url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function fromBase64Url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createInviteToken({
  tenantId,
  role,
  invitedBy,
}: {
  tenantId: string;
  role: InviteRole;
  invitedBy: string;
}): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = toBase64Url(JSON.stringify({ tenantId, role, invitedBy, expiresAt }));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyInviteToken(token: string): InvitePayload {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) throw new Error("Invalid token format");

  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const expectedSig = sign(payload);

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error("Invalid token signature");
  }

  let data: InvitePayload;
  try {
    data = JSON.parse(fromBase64Url(payload));
  } catch {
    throw new Error("Malformed token payload");
  }

  if (isVendorInvite(data)) {
    if (!data.vendorId || !data.invitedBy || !data.expiresAt) {
      throw new Error("Incomplete vendor token payload");
    }
  } else {
    if (!data.tenantId || !data.role || !data.invitedBy || !data.expiresAt) {
      throw new Error("Incomplete token payload");
    }
  }

  if (Date.now() > data.expiresAt) {
    throw new Error("Invite link has expired");
  }

  return data;
}

export function createVendorInviteToken({
  vendorId,
  invitedBy,
}: {
  vendorId: string;
  invitedBy: string;
}): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = toBase64Url(JSON.stringify({ vendorId, invitedBy, expiresAt }));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}
