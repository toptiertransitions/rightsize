"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Download } from "lucide-react";

// Join link + QR code for a community. Downloads: PNG, SVG, and a printable
// SVG card with the community name and link under the code.
export function JoinLinkPanel({ joinUrl, code, displayName }: { joinUrl: string; code: string; displayName: string }) {
  const [png, setPng] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 800, margin: 2 }).then(setPng).catch(() => setPng(""));
    QRCode.toString(joinUrl, { type: "svg", margin: 2 }).then(setSvg).catch(() => setSvg(""));
  }, [joinUrl]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(""), 2000); });
  }

  function download(href: string, name: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  }

  function printable(): string {
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const size = vb ? Number(vb[1]) : 33;
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760">
<rect width="600" height="760" fill="#ffffff"/>
<text x="300" y="70" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#111827">${esc(displayName)}</text>
<text x="300" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#4B5563">Scan to start your move plan</text>
<svg x="100" y="140" width="400" height="400" viewBox="0 0 ${size} ${size}">${inner}</svg>
<text x="300" y="590" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#111827">${esc(joinUrl.replace(/^https?:\/\//, ""))}</text>
<text x="300" y="630" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#4B5563">Community code: ${esc(code)}</text>
<text x="300" y="720" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#9CA3AF">Powered by Rightsize</text>
</svg>`;
  }

  const svgHref = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  const btn = "h-9 px-3 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 inline-flex items-center gap-1.5";

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Join link and QR code</h2>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="w-36 h-36 bg-white rounded-lg p-1.5 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {png && <img src={png} alt={`QR code for ${joinUrl}`} className="w-full h-full" />}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-sm text-gray-200 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">{joinUrl}</code>
            <button type="button" onClick={() => copy(joinUrl, "url")} className={btn}>{copied === "url" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy</button>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            Community code: <code className="text-gray-200">{code || "—"}</code>
            {code && <button type="button" onClick={() => copy(code, "code")} className="text-gray-500 hover:text-gray-300">{copied === "code" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!png} onClick={() => download(png, `${code || "community"}-qr.png`)} className={btn}><Download className="w-4 h-4" /> PNG</button>
            <button type="button" disabled={!svg} onClick={() => download(svgHref(svg), `${code || "community"}-qr.svg`)} className={btn}><Download className="w-4 h-4" /> SVG</button>
            <button type="button" disabled={!svg} onClick={() => download(svgHref(printable()), `${code || "community"}-qr-printable.svg`)} className={btn}><Download className="w-4 h-4" /> Printable card</button>
          </div>
          <p className="text-xs text-gray-500">The link and code only brand new sign-ups once the tenant is published.</p>
        </div>
      </div>
    </section>
  );
}
