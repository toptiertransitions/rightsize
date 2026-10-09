"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, MessageSquare, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, type BrandContactView } from "@/lib/brands/shared";

// "Your [Community] contacts" card on the client Home screen (and the admin
// live preview). Layout adapts to the count: 1 is a featured card with a big
// headshot, 2-3 a list, 4-5 a compact list. Colors come from the brand's
// CSS variables (accent = the brand's secondary color).

function telHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function Avatar({ c, size }: { c: BrandContactView; size: number }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // An image can fail before hydration attaches onError; catch that too.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [c.photoUrl]);
  const style = { width: size, height: size };
  if (c.photoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={imgRef} src={c.photoUrl} alt="" onError={() => setFailed(true)} style={style} className="rounded-full object-cover flex-shrink-0 bg-accent-50" />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className="rounded-full bg-accent-600 text-white font-semibold flex items-center justify-center flex-shrink-0"
    >
      {initials(c.name)}
    </span>
  );
}

function Actions({ c, compact, small, full }: { c: BrandContactView; compact: boolean; small?: boolean; full?: boolean }) {
  const items = [
    c.phone && { href: `tel:${telHref(c.phone)}`, label: "Call", Icon: Phone },
    c.phone && { href: `sms:${telHref(c.phone)}`, label: "Text", Icon: MessageSquare },
    c.email && { href: `mailto:${c.email}`, label: "Email", Icon: Mail },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof Phone }[];
  if (items.length === 0) return null;
  return (
    <div className={cn(full ? "grid grid-cols-3 gap-2 mt-4" : small ? "flex gap-1" : "flex flex-wrap gap-1.5", compact && !small ? "mt-1.5" : !full && !compact && "mt-3")}>
      {items.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          aria-label={`${label} ${c.name}`}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full border border-accent-600 text-accent-700 font-semibold hover:bg-accent-50 transition-colors",
            compact ? (small ? "w-8 h-8" : "w-10 h-10") : "h-11 px-3 text-sm"
          )}
        >
          <Icon className={small ? "w-3.5 h-3.5" : "w-4 h-4"} />
          {!compact && label}
        </a>
      ))}
    </div>
  );
}

export function BrandContactsCard({
  displayName,
  contacts,
  welcomeMessage,
  welcomeSenderName,
  welcomeSenderTitle,
}: {
  displayName: string;
  contacts: BrandContactView[];
  welcomeMessage?: string;
  welcomeSenderName?: string;
  welcomeSenderTitle?: string;
}) {
  if (contacts.length === 0) return null;
  const featured = contacts.length === 1;
  const compact = contacts.length >= 4;
  const sender = [welcomeSenderName, welcomeSenderTitle].filter(Boolean).join(", ");
  // "Your Roosevelt contacts", not "Your The Roosevelt contacts"
  const label = displayName.replace(/^the\s+/i, "");

  return (
    <section aria-label={`Your ${label} contacts`} className="bg-white border border-cream-200 rounded-2xl p-4 sm:p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-accent-700">Your {label} contacts</h2>

      {welcomeMessage && (
        <div className="mt-2 mb-1">
          <p className="text-sm text-gray-700 leading-relaxed">{welcomeMessage}</p>
          {sender && <p className="text-xs text-gray-500 mt-1">{sender}</p>}
        </div>
      )}

      {featured ? (
        <div className="mt-3">
          <div className="flex items-center gap-4">
            <Avatar c={contacts[0]} size={64} />
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900">{contacts[0].name}</p>
              {contacts[0].title && <p className="text-sm text-gray-500">{contacts[0].title}</p>}
            </div>
          </div>
          <Actions c={contacts[0]} compact={false} full />
        </div>
      ) : compact ? (
        // 4-5 contacts: a swipeable row of headshot cards keeps the card short
        <ul className="mt-3 -mx-4 px-4 sm:-mx-5 sm:px-5 flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {contacts.map((c) => (
            <li key={c.id} className="snap-start shrink-0 w-[144px] rounded-xl border border-cream-200 p-3 flex flex-col items-center text-center">
              <Avatar c={c} size={48} />
              <p className="mt-2 text-[13px] font-semibold text-gray-900 leading-tight line-clamp-2">{c.name}</p>
              {c.title && <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">{c.title}</p>}
              <div className="mt-auto pt-2"><Actions c={c} compact small /></div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 divide-y divide-cream-100">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-3">
              <Avatar c={c} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                {c.title && <p className="text-xs text-gray-500">{c.title}</p>}
                <Actions c={c} compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
