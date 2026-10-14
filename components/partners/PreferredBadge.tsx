// "The Roosevelt Preferred Partner": shown on a partner card when the
// client's senior community tagged this partner as preferred.
export function PreferredBadge({ communities }: { communities?: string[] }) {
  if (!communities?.length) return null;
  const label = communities.length === 1 ? `${communities[0]} Preferred Partner` : `Preferred by ${communities.join(" & ")}`;
  return (
    <span className="inline-flex items-center gap-1 self-start max-w-full text-[11px] font-semibold text-[#7A5C1E] bg-[#FBF5E6] border border-[#E9D9AE] rounded-full px-2 py-0.5">
      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" />
      </svg>
      <span className="truncate">{label}</span>
    </span>
  );
}
