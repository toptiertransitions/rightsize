// @mentions in message bodies are stored as <@clerkUserId> tokens (the
// same convention Slack uses), so a renamed person still resolves, and
// rendered as "@Name". Safe to import from client and server code.

const TOKEN = /<@(user_[A-Za-z0-9]+)>/g;

export function mentionToken(userId: string): string {
  return `<@${userId}>`;
}

export function mentionedIds(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(TOKEN), (m) => m[1])));
}

/** The body as plain text, with tokens shown as "@Name" (previews, pushes). */
export function plainMentions(body: string, nameOf: (id: string) => string): string {
  return body.replace(TOKEN, (_, id: string) => `@${nameOf(id)}`);
}

export type BodySegment = { text: string } | { mentionId: string };

/** Splits a body into text and mention segments for rendering. */
export function splitMentions(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ mentionId: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/**
 * Composer text uses readable "@Name" — on send, each person picked from
 * the suggestion list becomes a token. Longest names first so "@Sam Rivera"
 * wins over "@Sam".
 */
export function encodeMentions(text: string, picked: { id: string; name: string }[]): string {
  let out = text;
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${p.name}`).join(mentionToken(p.id));
  }
  return out;
}
