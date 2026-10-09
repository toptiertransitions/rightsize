// Community brands (white-label "tenant" branding), shared by server and
// client code. Nothing secret lives here: contact details are resolved
// server-side and only sent to users tied to the brand.
//
// Naming note: in this codebase a "Tenant" is a project, so the white-label
// concept is called a Community Brand (Airtable table CommunityBrands). The
// admin screen still calls it "Tenant Config".

export type BrandStatus = "Draft" | "Active";
export type TopTierVisibility = "Partner visible" | "Minimal";

/** One configured contact on a brand. Details (name, phone, email, title)
 * always come from the CRM contact record; only display tweaks live here. */
export interface BrandContactRef {
  contactId: string;
  order: number;
  visible: boolean;
  titleOverride?: string;
  photoUrl?: string;
}

export interface CommunityBrand {
  id: string;
  slug: string;
  communityCode: string;
  displayName: string;
  subtitle: string;
  marketplacePartnerId: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  status: BrandStatus;
  welcomeMessage: string;
  welcomeSenderName: string;
  welcomeSenderTitle: string;
  topTierVisibility: TopTierVisibility;
  contacts: BrandContactRef[];
  slugLockedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Safe for unauthenticated pages (join link, sign-up): no contacts, no ids. */
export interface PublicBrand {
  slug: string;
  displayName: string;
  subtitle: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeMessage: string;
  welcomeSenderName: string;
  welcomeSenderTitle: string;
  topTierVisibility: TopTierVisibility;
}

/** A contact as shown on the client's Home screen. */
export interface BrandContactView {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  photoUrl?: string;
}

export const MAX_BRAND_CONTACTS = 5;

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const CODE_RE = /^[A-Z0-9]{3,20}$/;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function toPublicBrand(b: CommunityBrand): PublicBrand {
  return {
    slug: b.slug,
    displayName: b.displayName,
    subtitle: b.subtitle,
    logoUrl: b.logoUrl,
    primaryColor: b.primaryColor,
    secondaryColor: b.secondaryColor,
    welcomeMessage: b.welcomeMessage,
    welcomeSenderName: b.welcomeSenderName,
    welcomeSenderTitle: b.welcomeSenderTitle,
    topTierVisibility: b.topTierVisibility,
  };
}

export function fullBrandName(b: Pick<PublicBrand, "displayName" | "subtitle">): string {
  return [b.displayName, b.subtitle].filter(Boolean).join(" ");
}

// ─── Colors ──────────────────────────────────────────────────────────────────
// The app's green palette (Tailwind `forest-*`) and the new `accent-*`
// palette are CSS variables (see tailwind.config.ts and globals.css). A brand
// overrides them with scales derived from its two hex colors: primary drives
// `forest-*` (buttons, headings, links), secondary drives `accent-*` (tile
// icons, "View" links, Call buttons, active nav, section labels, avatars).

type Rgb = [number, number, number];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

/** 50 to 900 scale with the given color as 600 (the app's main shade). */
export function colorScale(hex: string): Record<(typeof SHADES)[number], string> {
  const base = hexToRgb(hex);
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  const steps: Record<number, Rgb> = {
    50: mix(base, white, 0.94),
    100: mix(base, white, 0.86),
    200: mix(base, white, 0.72),
    300: mix(base, white, 0.55),
    400: mix(base, white, 0.35),
    500: mix(base, white, 0.16),
    600: base,
    700: mix(base, black, 0.16),
    800: mix(base, black, 0.3),
    900: mix(base, black, 0.42),
  };
  return Object.fromEntries(SHADES.map((s) => [s, steps[s].join(" ")])) as Record<(typeof SHADES)[number], string>;
}

/** The CSS that applies a brand's colors app-wide. */
export function brandCss(primary: string, secondary: string): string {
  const p = colorScale(primary);
  const s = colorScale(secondary);
  const vars = SHADES.map((k) => `--forest-${k}:${p[k]};--accent-${k}:${s[k]};`).join("");
  return `:root{${vars}}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}
