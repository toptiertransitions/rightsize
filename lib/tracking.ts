import { createHmac } from "crypto";

function sign(enrollmentId: string): string {
  const secret = process.env.TRACK_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(enrollmentId).digest("hex").slice(0, 16);
}

export function verifyTrackToken(enrollmentId: string, token: string): boolean {
  const expected = sign(enrollmentId);
  if (!expected || !token) return false;
  return expected === token;
}

export function injectTracking(html: string, enrollmentId: string, baseUrl: string): string {
  const t = sign(enrollmentId);
  if (!t) return html;

  // Rewrite all http/https href links to click-tracking redirects (double or single quotes)
  const tracked = html.replace(
    /href=(["'])(https?:\/\/[^"']+)\1/gi,
    (_, q: string, url: string) => {
      if (url.includes("/api/track/")) return `href=${q}${url}${q}`;
      const encoded = encodeURIComponent(url);
      return `href="${baseUrl}/api/track/click?e=${enrollmentId}&url=${encoded}&t=${t}" target="_blank"`;
    }
  );

  // Inject 1×1 open-tracking pixel before </body>
  const pixel = `<img src="${baseUrl}/api/track/open?e=${enrollmentId}&t=${t}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  if (/<\/body>/i.test(tracked)) {
    return tracked.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return tracked + pixel;
}
