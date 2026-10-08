// Live search for the Tips page: case-insensitive, every word must appear.
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean);
}

export function textMatches(words: string[], ...texts: Array<string | undefined>): boolean {
  if (words.length === 0) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
