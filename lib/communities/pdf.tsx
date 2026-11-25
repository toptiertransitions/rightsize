import React from "react";
import path from "path";
import { readFileSync } from "fs";
import { Document, Font, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatAddress, RULE_DEFINITIONS, ruleStatus, type Community, type CommunityContact } from "./types";

// "TTT Community Guide" one-pager: a US Letter sheet for one community,
// always exactly one page. Fonts, the NASMM badge and the master logo are
// the ones the review collateral PDF ships (lib/review-collateral/assets);
// the white header logo is made from that logo by
// scripts/community/make-white-logo.mjs. Both folders are listed in
// outputFileTracingIncludes in next.config.ts.
//
// Fit: render, count pages, and if it spills, step the type down (never
// under 8.5pt) and tighten spacing; if it still spills at the smallest
// size, trim the lowest-priority blocks with "See Rightsize for full
// details" instead of adding a page.

const SHARED = path.join(process.cwd(), "lib/review-collateral/assets");
const OWN = path.join(process.cwd(), "lib/communities/assets");
const png = (dir: string, name: string) => ({ data: readFileSync(path.join(dir, name)), format: "png" as const });

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({ family: "Lora", fonts: [{ src: path.join(SHARED, "Lora-Regular.ttf") }, { src: path.join(SHARED, "Lora-Italic.ttf"), fontStyle: "italic" }] });
  Font.register({
    family: "Poppins",
    fonts: [
      { src: path.join(SHARED, "Poppins-Regular.ttf") },
      { src: path.join(SHARED, "Poppins-Medium.ttf"), fontWeight: 500 },
      { src: path.join(SHARED, "Poppins-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const C = { green: "#004935", sage: "#6E7C5C", gold: "#C9A96E", cream: "#F6F2E9", ink: "#2B2B2B", muted: "#5E655C", rule: "#DDD3BC", white: "#FFFFFF", headerSub: "#D8E3DA" };
const MORE = "See Rightsize for full details.";
const TO_CONFIRM = "To confirm with the community";
const MIN_PT = 8.5;

export interface CommunityPdfOptions {
  includeInternalNotes: boolean;
  hideUnknown: boolean;
}

/** Type and spacing for one fit attempt. */
interface Scale { body: number; label: number; gap: number; pad: number }
const SCALES: Scale[] = [
  { body: 10.5, label: 9, gap: 9, pad: 16 },
  { body: 10, label: 9, gap: 8, pad: 14 },
  { body: 9.5, label: 8.5, gap: 7, pad: 13 },
  { body: 9, label: 8.5, gap: 6, pad: 12 },
  { body: 8.5, label: 8.5, gap: 5, pad: 10 },
];

/** How much to trim when the smallest type still spills. */
interface Trim { internal: number | null; other: number | null; contacts: number; ruleChars: number | null }
// Least to most trimmed; the first one that fits wins.
const TRIMS: Trim[] = [
  { internal: null, other: null, contacts: 99, ruleChars: null },
  { internal: 400, other: null, contacts: 99, ruleChars: null },
  { internal: 200, other: 600, contacts: 8, ruleChars: 600 },
  { internal: 0, other: 450, contacts: 6, ruleChars: 480 },
  { internal: 0, other: 350, contacts: 6, ruleChars: 400 },
  { internal: 0, other: 280, contacts: 4, ruleChars: 340 },
  { internal: 0, other: 220, contacts: 4, ruleChars: 290 },
  { internal: 0, other: 160, contacts: 4, ruleChars: 240 },
  { internal: 0, other: 120, contacts: 3, ruleChars: 200 },
  { internal: 0, other: 0, contacts: 2, ruleChars: 160 },
  { internal: 0, other: 0, contacts: 2, ruleChars: 110 },
];

const cut = (s: string, n: number | null) =>
  n === null || s.length <= n ? s : `${s.slice(0, Math.max(0, n)).replace(/\s+\S*$/, "").replace(/[\s.,;:]+$/, "")}... ${MORE}`;

function GuideDocument({ community: c, contacts, opts, scale: k, trim, verifiedLabel }: {
  community: Community; contacts: CommunityContact[]; opts: CommunityPdfOptions; scale: Scale; trim: Trim; verifiedLabel: string;
}) {
  const label = { fontFamily: "Poppins", fontWeight: 700, fontSize: k.label, letterSpacing: 0.6, color: C.green, textTransform: "uppercase" as const };
  const body = { fontFamily: "Poppins", fontSize: k.body, lineHeight: 1.35, color: C.ink };
  const pending = { fontFamily: "Lora", fontStyle: "italic" as const, fontSize: k.body, color: C.sage };
  const heading = { fontFamily: "Lora", fontSize: k.body + 4, color: C.green, marginBottom: k.gap * 0.6 };

  const rows = RULE_DEFINITIONS.filter((r) => r.pdfGlance).flatMap((r) => {
    const status = ruleStatus(c, r.key);
    if (status === "unknown" && opts.hideUnknown) return [];
    let value = status === "known" ? c.rules[r.key].trim() : "";
    if (r.key === "coi_required" && status === "known" && ruleStatus(c, "coi_details") === "known") {
      value = `${value}. ${c.rules.coi_details.trim()}`;
    }
    return [{ key: r.key, label: r.shortLabel, status, value: cut(value, trim.ruleChars) }];
  });
  const half = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, half), rows.slice(half)];

  const active = contacts.filter((p) => !p.archived).sort((a, b) => Number(b.isPrimaryMoveIn) - Number(a.isPrimaryMoveIn) || a.sortOrder - b.sortOrder);
  const shown = active.slice(0, trim.contacts);
  const otherStatus = ruleStatus(c, "other");
  const other = otherStatus === "known" && trim.other !== 0 ? cut(c.rules.other.trim(), trim.other) : "";
  const internal = opts.includeInternalNotes && c.internalNotes.trim() && trim.internal !== 0 ? cut(c.internalNotes.trim(), trim.internal) : "";
  const subLine = [c.type, c.operator].filter(Boolean).join("  |  ");
  const address = formatAddress(c);

  return (
    <Document title={`TTT Community Guide - ${c.name}`} author="Top Tier Transitions">
      <Page size="LETTER" style={{ backgroundColor: C.white, fontFamily: "Poppins" }}>
        {/* Header band */}
        <View style={{ backgroundColor: C.green, paddingTop: 26, paddingBottom: 22, paddingHorizontal: 40, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 18 }}>
            <Text style={{ fontFamily: "Lora", fontSize: c.name.length > 34 ? 21 : 25, color: C.white, lineHeight: 1.15 }}>{c.name}</Text>
            {subLine ? <Text style={{ fontFamily: "Poppins", fontWeight: 500, fontSize: MIN_PT + 0.5, color: C.gold, marginTop: 6, letterSpacing: 0.4 }}>{subLine}</Text> : null}
            {address ? <Text style={{ fontFamily: "Poppins", fontSize: MIN_PT + 0.5, color: C.headerSub, marginTop: 3 }}>{address}</Text> : null}
          </View>
          <Image src={png(OWN, "logo-white.png")} style={{ width: 150, height: 150 * (381 / 1479) }} />
        </View>
        <View style={{ height: 3, backgroundColor: C.gold }} />

        <View style={{ paddingHorizontal: 40, paddingTop: k.pad + 2, flexGrow: 1 }}>
          {/* Move-Day at a Glance */}
          <View style={{ backgroundColor: C.cream, borderRadius: 6, padding: k.pad, marginBottom: k.gap * 1.6 }}>
            <Text style={heading}>Move-Day at a Glance</Text>
            <View style={{ flexDirection: "row" }}>
              {columns.map((colRows, i) => (
                <View key={i} style={{ flex: 1, paddingRight: i === 0 ? 12 : 0, paddingLeft: i === 1 ? 12 : 0 }}>
                  {colRows.map((r) => (
                    <View key={r.key} style={{ marginBottom: k.gap }} wrap={false}>
                      <Text style={label}>{r.label}</Text>
                      {r.status === "known" ? <Text style={{ ...body, marginTop: 1.5 }}>{r.value}</Text>
                        : r.status === "not_applicable" ? <Text style={{ ...body, color: C.muted, marginTop: 1.5 }}>Not applicable</Text>
                        : <Text style={{ ...pending, marginTop: 1.5 }}>{TO_CONFIRM}</Text>}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>

          {/* Contacts */}
          <Text style={heading}>Contacts</Text>
          {shown.length === 0 ? (
            <Text style={{ ...pending, marginBottom: k.gap * 1.6 }}>{TO_CONFIRM}</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: k.gap * 0.6 }}>
              {shown.map((p, i) => (
                <View key={p.id} wrap={false} style={{
                  width: "50%", paddingRight: i % 2 === 0 ? 12 : 0, paddingLeft: i % 2 === 1 ? 12 : 0, marginBottom: k.gap,
                }}>
                  <View style={{ borderLeftWidth: 2, borderLeftColor: p.isPrimaryMoveIn ? C.gold : C.rule, paddingLeft: 8 }}>
                    <Text style={{ ...body, fontWeight: 700, color: C.green }}>
                      {p.name}{p.isPrimaryMoveIn ? <Text style={{ fontWeight: 500, color: C.sage }}>{"   "}Move-In Contact</Text> : null}
                    </Text>
                    {p.title || p.role ? <Text style={{ ...body, color: C.muted }}>{p.title || p.role}</Text> : null}
                    {p.phones.map((ph, j) => <Text key={j} style={body}>{ph.label}: {ph.number}</Text>)}
                    {p.email ? <Text style={body}>{p.email}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          )}
          {active.length > shown.length ? <Text style={{ ...body, color: C.muted, marginTop: -k.gap * 0.4, marginBottom: k.gap }}>{active.length - shown.length} more contact{active.length - shown.length === 1 ? "" : "s"}. {MORE}</Text> : null}

          {/* Other Rules & Tips */}
          {other ? (
            <View style={{ marginBottom: k.gap * 1.4 }}>
              <Text style={heading}>Other Rules & Tips</Text>
              <Text style={body}>{other}</Text>
            </View>
          ) : null}
          {otherStatus === "known" && trim.other === 0 ? <Text style={{ ...body, color: C.muted, marginBottom: k.gap }}>Other rules and tips: {MORE}</Text> : null}

          {/* Internal notes (off unless chosen) */}
          {internal ? (
            <View style={{ marginBottom: k.gap * 1.4, borderTopWidth: 0.75, borderTopColor: C.rule, paddingTop: k.gap }}>
              <Text style={{ ...label, color: C.sage }}>Internal notes (TTT only)</Text>
              <Text style={{ ...body, marginTop: 2 }}>{internal}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <View style={{ borderTopWidth: 0.75, borderTopColor: C.rule, marginHorizontal: 40, paddingTop: 10, paddingBottom: 22, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Poppins", fontWeight: 500, fontSize: MIN_PT + 0.5, color: C.green }}>Prepared by Top Tier Transitions | Senior Move Management. Done Right.</Text>
            <Text style={{ fontFamily: "Poppins", fontSize: MIN_PT, color: C.muted, marginTop: 2 }}>312-600-3016  |  toptiertransitions.com  |  {verifiedLabel}</Text>
          </View>
          <Image src={png(SHARED, "badge-nasmm-certified.png")} style={{ width: 46, height: 46 * (344 / 349) }} />
        </View>
      </Page>
    </Document>
  );
}

const pageCount = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

export function verifiedLabel(c: Pick<Community, "lastVerified">): string {
  if (!c.lastVerified) return "Not yet verified";
  const d = new Date(`${c.lastVerified}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `Last verified ${d}`;
}

/** Always one page; returns how it was fit, for logs and tests. */
export async function renderCommunityGuidePdf(
  community: Community,
  contacts: CommunityContact[],
  opts: CommunityPdfOptions
): Promise<{ buffer: Buffer; scale: number; trimLevel: number; pages: number }> {
  registerFonts();
  const label = verifiedLabel(community);
  let last: { buffer: Buffer; scale: number; trimLevel: number; pages: number } | null = null;
  for (let t = 0; t < TRIMS.length; t++) {
    // Only trim once the smallest type is reached
    const scales = t === 0 ? SCALES : [SCALES[SCALES.length - 1]];
    for (const scale of scales) {
      const buffer = Buffer.from(await renderToBuffer(
        <GuideDocument community={community} contacts={contacts} opts={opts} scale={scale} trim={TRIMS[t]} verifiedLabel={label} />
      ));
      const pages = pageCount(buffer);
      last = { buffer, scale: scale.body, trimLevel: t, pages };
      if (pages <= 1) return last;
    }
  }
  return last!;
}

export function guideFileName(c: Pick<Community, "name">): string {
  return `TTT Community Guide - ${c.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.pdf`;
}
