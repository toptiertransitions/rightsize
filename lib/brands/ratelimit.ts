// Rate limits for guessing community codes: per IP and per signed-in user.
// Same Upstash setup as document uploads (lib/documents.ts); fails open only
// when Upstash isn't configured at all.
import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { headers } from "next/headers";

let ipLimiter: Ratelimit | null = null;
let userLimiter: Ratelimit | null = null;

function limiters() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!ipLimiter) {
    const redis = Redis.fromEnv();
    ipLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 h"), prefix: "brand-code-ip" });
    userLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, "1 h"), prefix: "brand-code-user" });
  }
  return { ip: ipLimiter!, user: userLimiter! };
}

export async function checkCodeRateLimit(userId: string): Promise<boolean> {
  const l = limiters();
  if (!l) return true;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const [a, b] = await Promise.all([l.ip.limit(ip), l.user.limit(userId)]);
  return a.success && b.success;
}
