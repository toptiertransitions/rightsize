// Deterministic, low-saturation brand-toned backgrounds for monogram fallbacks —
// picked by a stable hash of the partner name so the same partner always gets
// the same tile color, without needing to store one.
const MONOGRAM_PALETTE = [
  "bg-forest-100 text-forest-700",
  "bg-amber-100 text-amber-700",
  "bg-blue-100 text-blue-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-purple-100 text-purple-700",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  // Only words that start with a letter count as an "initial" — skips
  // connectors like "&" so "Weissman & Co." reads as "WC", not "W&".
  const words = name.trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Pads the logo into a square white/neutral canvas so nothing is ever
// cropped or stretched, regardless of the source image's aspect ratio.
function transformLogoUrl(url: string): string {
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/c_pad,w_160,h_160,b_white,f_auto,q_auto,dpr_auto/");
}

interface Props {
  logo?: string;
  name: string;
  size?: "mobile" | "desktop" | "tray";
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  mobile: "w-16 h-16",
  desktop: "w-16 h-16 sm:w-[72px] sm:h-[72px]",
  // Small, subtle mark for the "Your Partners" tray cards — a corner
  // accent that never competes with the partner name for attention.
  tray: "w-9 h-9",
};

export function PartnerLogo({ logo, name, size = "desktop" }: Props) {
  const dims = SIZE_CLASSES[size];
  const isTray = size === "tray";

  if (logo) {
    return (
      <div className={`${dims} flex-shrink-0 ${isTray ? "rounded-lg" : "rounded-xl"} bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center ${isTray ? "p-1" : "p-1.5"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={transformLogoUrl(logo)}
          alt={`${name} logo`}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const palette = MONOGRAM_PALETTE[hashString(name) % MONOGRAM_PALETTE.length];
  return (
    <div className={`${dims} flex-shrink-0 ${isTray ? "rounded-lg" : "rounded-xl"} ${palette} flex items-center justify-center font-bold ${isTray ? "text-[11px]" : "text-lg"}`}>
      <span aria-hidden="true">{initials(name)}</span>
      <span className="sr-only">{name} logo</span>
    </div>
  );
}
