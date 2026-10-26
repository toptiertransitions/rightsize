// Building blocks for the Plan page "Email Me" emails. Each template describes
// its content once as blocks; renderEmail turns that into table-based,
// inline-styled HTML (Gmail, Outlook, Apple Mail, mobile) and a plain-text
// fallback. Missing data is a Placeholder: "[Like this]" on a soft yellow
// background so the sender can find and fill it before forwarding.

export const BRAND = {
  green: "#25583F",      // forest-700: titles
  greenBright: "#2E6B4F", // forest-600: accents
  cream: "#FAF8F5",
  ink: "#1F2937",
  muted: "#6B7280",
  faint: "#9CA3AF",
  line: "#E5E7EB",
  phBg: "#FEF3C7",
  phInk: "#92400E",
};

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export type Placeholder = { ph: string };
export type Part = string | Placeholder | { b: string };
export type Value = Part | Part[];

export function ph(label: string): Placeholder {
  return { ph: label };
}

/** The value if present, otherwise a bracketed placeholder. */
export function val(v: string | number | null | undefined, placeholder: string): Part {
  const s = v == null ? "" : String(v).trim();
  return s ? s : ph(placeholder);
}

export function isPh(p: Part): p is Placeholder {
  return typeof p === "object" && "ph" in p;
}

export interface Row {
  icon?: string;
  label: string;
  value: Value;
}

export type Block =
  | { kind: "rows"; rows: Row[] }
  | { kind: "para"; parts: Value }
  | { kind: "list"; ordered?: boolean; checklist?: boolean; items: Value[] }
  | { kind: "callout"; title?: string; parts: Value; tone?: "green" | "amber" }
  | { kind: "raw"; html: string; text: string };

export interface Section {
  label: string;
  blocks: Block[];
}

export interface Sender {
  name: string;
  title?: string;
  phone?: string;
  email: string;
}

export interface EmailDoc {
  subject: string;
  kicker: string;
  title: string;
  subtitle?: Value;
  greeting: Value[];      // opening paragraphs
  sections: Section[];
  closing: Value[];       // closing paragraphs, before the signature
  sender: Sender;
  logoUrl?: string;
  footer?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parts(v: Value): Part[] {
  return Array.isArray(v) ? v : [v];
}

export function partsHtml(v: Value): string {
  return parts(v)
    .map((p) => {
      if (typeof p === "string") return esc(p).replace(/\n/g, "<br>");
      if (isPh(p)) return `<span style="background:${BRAND.phBg};color:${BRAND.phInk};padding:1px 4px;border-radius:3px;">[${esc(p.ph)}]</span>`;
      return `<strong>${esc(p.b)}</strong>`;
    })
    .join("");
}

export function partsText(v: Value): string {
  return parts(v)
    .map((p) => (typeof p === "string" ? p : isPh(p) ? `[${p.ph}]` : p.b))
    .join("");
}

/** True when every part is a placeholder or blank (used to hide OPTIONAL sections). */
export function isEmptyValue(v: Value): boolean {
  return parts(v).every((p) => (typeof p === "string" ? !p.trim() : isPh(p)));
}

function rowsHtml(rows: Row[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows
    .map(
      (r) => `<tr>
<td valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid ${BRAND.line};width:36%;font-family:${SANS};font-size:13px;font-weight:600;color:${BRAND.ink};">${r.icon ? `${r.icon}&nbsp; ` : ""}${esc(r.label)}</td>
<td valign="top" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:${SANS};font-size:14px;line-height:1.5;color:${BRAND.ink};">${partsHtml(r.value)}</td>
</tr>`,
    )
    .join("")}</table>`;
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "rows":
      return rowsHtml(b.rows);
    case "para":
      return `<p style="margin:10px 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink};">${partsHtml(b.parts)}</p>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      if (b.checklist) {
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">${b.items
          .map((i) => `<tr><td valign="top" style="padding:3px 8px 3px 0;font-family:${SANS};font-size:15px;color:${BRAND.greenBright};">&#9744;</td><td style="padding:3px 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink};">${partsHtml(i)}</td></tr>`)
          .join("")}</table>`;
      }
      return `<${tag} style="margin:8px 0;padding-left:22px;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink};">${b.items
        .map((i) => `<li style="margin:4px 0;">${partsHtml(i)}</li>`)
        .join("")}</${tag}>`;
    }
    case "callout": {
      const amber = b.tone === "amber";
      const border = amber ? "#F59E0B" : BRAND.greenBright;
      const bg = amber ? "#FFFBEB" : "#F0F7F4";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0;border-collapse:separate;"><tr><td style="border:1px solid ${border};border-left:4px solid ${border};background:${bg};border-radius:6px;padding:14px 16px;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink};">${
        b.title ? `<p style="margin:0 0 4px;font-weight:700;">${esc(b.title)}</p>` : ""
      }${partsHtml(b.parts)}</td></tr></table>`;
    }
    case "raw":
      return b.html;
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case "rows":
      return b.rows.map((r) => `${r.label}: ${partsText(r.value)}`).join("\n");
    case "para":
      return partsText(b.parts);
    case "list":
      return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : b.checklist ? "[ ]" : "-"} ${partsText(i)}`).join("\n");
    case "callout":
      return `${b.title ? `${b.title}\n` : ""}${partsText(b.parts)}`;
    case "raw":
      return b.text;
  }
}

function signatureHtml(s: Sender): string {
  const line = (v?: string) => (v ? `<br>${esc(v)}` : "");
  return `<p style="margin:18px 0 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${BRAND.ink};"><strong style="color:${BRAND.green};">${esc(s.name)}</strong>${
    s.title ? `<br><span style="color:${BRAND.muted};">${esc(s.title)}</span>` : `<br>${partsHtml(ph("Title"))}`
  }<br>Top Tier Transitions${s.phone ? line(s.phone) : `<br>${partsHtml(ph("Phone"))}`}<br><a href="mailto:${esc(s.email)}" style="color:${BRAND.greenBright};">${esc(s.email)}</a></p>`;
}

function signatureText(s: Sender): string {
  return [s.name, s.title || "[Title]", "Top Tier Transitions", s.phone || "[Phone]", s.email].join("\n");
}

export function renderEmail(doc: EmailDoc): { subject: string; html: string; text: string } {
  const logo = doc.logoUrl && /^https:\/\//.test(doc.logoUrl)
    ? `<img src="${esc(doc.logoUrl)}" alt="Top Tier Transitions" height="64" style="height:64px;width:auto;display:block;border:0;margin:0 auto 18px;">`
    : "";
  const sections = doc.sections
    .map(
      (s) => `<tr><td style="padding:22px 32px 0;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${BRAND.faint};">${esc(s.label)}</p>
${s.blocks.map(blockHtml).join("\n")}
</td></tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:10px;border-top:6px solid ${BRAND.green};">
<tr><td style="padding:30px 32px 6px;text-align:center;">
${logo}<p style="margin:0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:${BRAND.greenBright};">${esc(doc.kicker)}</p>
<h1 style="margin:10px 0 0;font-family:${SERIF};font-size:32px;line-height:1.2;font-weight:normal;color:${BRAND.green};">${esc(doc.title)}</h1>
${doc.subtitle ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:14px;color:${BRAND.muted};">${partsHtml(doc.subtitle)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 32px 0;">${doc.greeting.map((g) => blockHtml({ kind: "para", parts: g })).join("")}</td></tr>
${sections}
<tr><td style="padding:22px 32px 30px;">${doc.closing.map((c) => blockHtml({ kind: "para", parts: c })).join("")}${signatureHtml(doc.sender)}</td></tr>
</table>
${doc.footer ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${BRAND.faint};">${esc(doc.footer)}</p>` : ""}
</td></tr></table>
</body></html>`;

  const text = [
    doc.kicker,
    doc.title,
    doc.subtitle ? partsText(doc.subtitle) : "",
    "",
    ...doc.greeting.map(partsText),
    "",
    ...doc.sections.map((s) => `${s.label.toUpperCase()}\n${s.blocks.map(blockText).join("\n\n")}\n`),
    ...doc.closing.map(partsText),
    "",
    signatureText(doc.sender),
    doc.footer ? `\n${doc.footer}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject: doc.subject, html, text };
}
