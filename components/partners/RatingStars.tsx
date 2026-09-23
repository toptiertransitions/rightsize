const STAR_PATH = "M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5z";

function Star({ fill }: { fill: "full" | "half" | "empty" }) {
  if (fill === "empty") {
    return (
      <svg className="w-3.5 h-3.5 text-gray-200 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d={STAR_PATH} />
      </svg>
    );
  }
  if (fill === "full") {
    return (
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d={STAR_PATH} />
      </svg>
    );
  }
  // Half star: an empty star behind, a clipped-to-50%-width full star on top — no
  // SVG <defs>/gradient IDs needed, so no risk of duplicate-ID collisions when
  // several half-star ratings render on the same page.
  return (
    <span className="relative w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
      <svg className="absolute inset-0 w-3.5 h-3.5 text-gray-200" viewBox="0 0 20 20" fill="currentColor">
        <path d={STAR_PATH} />
      </svg>
      <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
        <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

export function RatingStars({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  if (reviewCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full">
        New Partner
      </span>
    );
  }

  const stars = Array.from({ length: 5 }, (_, i) => {
    const threshold = i + 1;
    if (rating >= threshold) return "full" as const;
    if (rating >= threshold - 0.5) return "half" as const;
    return "empty" as const;
  });

  return (
    <div className="flex items-center gap-1.5" aria-label={`${rating.toFixed(1)} out of 5 stars, ${reviewCount} review${reviewCount !== 1 ? "s" : ""}`}>
      <div className="flex items-center gap-0.5">
        {stars.map((fill, i) => <Star key={i} fill={fill} />)}
      </div>
      <span className="text-xs font-semibold text-gray-700">{rating.toFixed(1)}</span>
      <span className="text-xs text-gray-400">· {reviewCount} review{reviewCount !== 1 ? "s" : ""}</span>
    </div>
  );
}
