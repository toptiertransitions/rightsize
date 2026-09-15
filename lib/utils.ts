import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number, decimals = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Safely parse a fetch Response as JSON. Platform-level rejections (e.g.
 * Vercel's ~4.5MB serverless request body limit) return a plain-text 413
 * before the request ever reaches our route handlers — calling res.json()
 * directly on that throws a cryptic "Unexpected token 'R', "Request En"...
 * is not valid JSON" instead of a usable error message. This reads the body
 * as text first and falls back to a status-based message when it isn't JSON.
 */
export async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413) {
      throw new Error("That file is too large to upload. Try a smaller image, or take a screenshot of it and upload that instead.");
    }
    throw new Error(`Server error (${res.status}). Please try again.`);
  }
}
