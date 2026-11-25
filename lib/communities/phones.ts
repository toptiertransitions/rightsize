// Phone parsing and display. Client-safe.
import { PHONE_LABELS, type Phone, type PhoneLabel } from "./types";

/** "(773) 878-6039" for a 10-digit US number (a leading 1 is dropped);
 * anything else comes back trimmed exactly as entered, so nothing is lost. */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim();
  const extMatch = trimmed.match(/\s*(?:x|ext\.?)\s*(\d+)$/i);
  const main = extMatch ? trimmed.slice(0, extMatch.index) : trimmed;
  const digits = main.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return trimmed;
  const out = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return extMatch ? `${out} x${extMatch[1]}` : out;
}

export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

const LABEL_WORDS: [RegExp, PhoneLabel][] = [
  [/^(?:d|direct)$/i, "Direct"],
  [/^(?:m|mobile|cell|c)$/i, "Mobile"],
  [/^(?:o|t|office|tel|phone)$/i, "Office"],
  [/^(?:main)$/i, "Main"],
  [/^(?:24\/7|24-7)$/i, "24/7"],
  [/^(?:text|sms)$/i, "Text"],
];

/** Parses strings like "D 630-960-4400; M 331-625-4760", "847-430-4121 (text)",
 * "(630) 994-3104; cell (708) 323-5229". `clean` is false when some part
 * couldn't be read, so the caller can keep the raw text somewhere. */
export function parsePhones(raw: string, defaultLabel: PhoneLabel = "Office"): { phones: Phone[]; clean: boolean } {
  const phones: Phone[] = [];
  let clean = true;
  for (const part of raw.split(/[;,\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)(\+?1?[\s.-]*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}(?:\s*(?:x|ext\.?)\s*\d+)?)(.*)$/i);
    if (!m) { clean = false; continue; }
    const words = `${m[1]} ${m[3]}`.replace(/[():–-]/g, " ").trim().split(/\s+/).filter(Boolean);
    let label: PhoneLabel | undefined;
    for (const w of words) {
      const hit = LABEL_WORDS.find(([re]) => re.test(w));
      if (hit) { label = hit[1]; break; }
    }
    if (words.length && !label) clean = false;
    phones.push({ label: label ?? defaultLabel, number: formatPhone(m[2]) });
  }
  return { phones, clean };
}

export function phonesDisplay(phones: Phone[]): string {
  return phones.map((p) => `${p.label}: ${p.number}`).join(" | ");
}

export function isPhoneLabel(v: unknown): v is PhoneLabel {
  return typeof v === "string" && (PHONE_LABELS as readonly string[]).includes(v);
}

/** Best number to put in an email or on a call button. */
export function bestPhone(phones: Phone[]): Phone | undefined {
  const order: PhoneLabel[] = ["Direct", "Mobile", "Office", "Main", "Text", "24/7"];
  return [...phones].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))[0];
}
