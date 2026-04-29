import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Contract, InvoiceSettings } from "./types";

// ─── HTML → text block parser ─────────────────────────────────────────────────

type Block = { text: string; heading?: boolean; bullet?: boolean };

function stripInline(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Work through the HTML extracting blocks in order
  let remaining = html;

  // Replace block-level elements with placeholders while capturing content
  const blockRe =
    /<(h[1-6]|li|p|div|td|th)[^>]*>([\s\S]*?)<\/\1>/gi;

  // We'll build an ordered list by scanning
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = /<(h[1-6]|li|p|div|td|th)[^>]*>([\s\S]*?)<\/\1>/gi;

  while ((match = re.exec(html)) !== null) {
    // Any raw text before this match
    const before = html.slice(lastIndex, match.index);
    const plainBefore = stripInline(before).replace(/\s+/g, " ").trim();
    if (plainBefore) {
      for (const line of plainBefore.split("\n")) {
        const t = line.trim();
        if (t) blocks.push({ text: t });
      }
    }

    const tag = match[1].toLowerCase();
    const content = stripInline(match[2]);
    if (content) {
      if (/^h[1-6]$/.test(tag)) {
        blocks.push({ text: content, heading: true });
      } else if (tag === "li") {
        blocks.push({ text: "• " + content, bullet: true });
      } else {
        // p / div / td / th — split by newlines
        for (const line of content.split("\n")) {
          const t = line.trim();
          if (t) blocks.push({ text: t });
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Tail after last block match
  const tail = stripInline(html.slice(lastIndex)).trim();
  if (tail) {
    for (const line of tail.split("\n")) {
      const t = line.trim();
      if (t) blocks.push({ text: t });
    }
  }

  // De-duplicate consecutive identical lines and filter empties
  return blocks.filter((b) => b.text.trim().length > 0);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  logo: { maxWidth: 120, maxHeight: 50, objectFit: "contain" },
  companyBlock: { alignItems: "flex-start" },
  companyName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#2E6B4F",
    marginBottom: 3,
  },
  companyDetail: { fontSize: 9, color: "#6b7280", marginBottom: 2 },
  docMeta: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#2E6B4F",
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { fontSize: 9, color: "#6b7280", width: 72 },
  metaValue: { fontSize: 9, color: "#374151", fontFamily: "Helvetica-Bold" },
  divider: { borderBottom: "1pt solid #e5e7eb", marginBottom: 20 },
  toBlock: { marginBottom: 20 },
  toLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  toValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  // Line items table
  tableWrap: {
    border: "1pt solid #e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    padding: "7 10",
    borderBottom: "1pt solid #e5e7eb",
  },
  tableRow: {
    flexDirection: "row",
    padding: "7 10",
    borderBottom: "1pt solid #f3f4f6",
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: "7 10",
    backgroundColor: "#f9fafb",
    borderBottom: "1pt solid #f3f4f6",
  },
  totalRow: {
    flexDirection: "row",
    padding: "9 10",
    backgroundColor: "#f0fdf4",
    borderTop: "2pt solid #2E6B4F",
  },
  colSvc: { flex: 3, fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  colHrs: { flex: 1, fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  colRate: { flex: 1, fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  colAmt: { flex: 1.5, fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  cellSvc: { flex: 3 },
  cellSvcName: { fontSize: 9, color: "#374151" },
  cellSvcDesc: { fontSize: 8, color: "#9ca3af", marginTop: 2 },
  cellHrs: { flex: 1, fontSize: 9, color: "#374151", textAlign: "right" },
  cellRate: { flex: 1, fontSize: 9, color: "#374151", textAlign: "right" },
  cellAmt: { flex: 1.5, fontSize: 9, color: "#374151", textAlign: "right" },
  totalLabel: { flex: 5, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#2E6B4F" },
  totalValue: { flex: 1.5, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#2E6B4F", textAlign: "right" },
  // Contract body
  bodySection: { marginBottom: 24 },
  bodyHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginTop: 14,
    marginBottom: 4,
  },
  bodyBullet: {
    fontSize: 10,
    color: "#374151",
    marginBottom: 3,
    paddingLeft: 8,
    lineHeight: 1.5,
  },
  bodyPara: {
    fontSize: 10,
    color: "#374151",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  // Not In Scope
  notInScopeSection: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderLeft: "3pt solid #d1d5db",
  },
  notInScopeHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 6,
  },
  notInScopeBody: {
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.5,
  },
  // Signature
  sigSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTop: "2pt solid #e5e7eb",
  },
  sigLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sigImage: { height: 56, maxWidth: 240, objectFit: "contain", marginBottom: 6 },
  sigTyped: {
    fontSize: 26,
    color: "#1a1a1a",
    fontFamily: "Helvetica-Oblique",
    marginBottom: 6,
  },
  sigLine: { borderBottom: "1pt solid #9ca3af", width: 240, marginBottom: 6 },
  sigName: { fontSize: 10, color: "#374151", fontFamily: "Helvetica-Bold" },
  sigDate: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTop: "1pt solid #e5e7eb",
    paddingTop: 10,
  },
  footerText: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

export interface ContractPDFProps {
  contract: Contract;
  tenantName: string;
  settings: InvoiceSettings | null;
}

export function ContractPDF({ contract, tenantName, settings }: ContractPDFProps) {
  const createdDate = new Date(contract.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const signedDate = contract.signedAt
    ? new Date(contract.signedAt).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  const lineItems = contract.lineItems ?? [];
  const showServiceHours = contract.includeServiceHours === true;
  const totalHours = lineItems.reduce((s, i) => s + i.hours, 0);
  const blocks = htmlToBlocks(contract.contractBody || "");

  const isDrawnSig =
    contract.signatureMethod === "draw" &&
    contract.signatureData?.startsWith("data:image/");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            {settings?.logoUrl ? (
              <Image src={settings.logoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>
              {settings?.companyName || "Top Tier Transitions"}
            </Text>
            {settings?.companyAddress ? (
              <Text style={styles.companyDetail}>{settings.companyAddress}</Text>
            ) : null}
            {settings?.companyPhone ? (
              <Text style={styles.companyDetail}>{settings.companyPhone}</Text>
            ) : null}
            {settings?.companyEmail ? (
              <Text style={styles.companyDetail}>{settings.companyEmail}</Text>
            ) : null}
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>SERVICE AGREEMENT</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{createdDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{contract.status}</Text>
            </View>
            {signedDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Signed</Text>
                <Text style={styles.metaValue}>{signedDate}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Client ── */}
        <View style={styles.toBlock}>
          <Text style={styles.toLabel}>Prepared For</Text>
          <Text style={styles.toValue}>{tenantName}</Text>
        </View>

        {/* ── Line Items ── */}
        {lineItems.length > 0 && (
          <View style={styles.tableWrap}>
            <View style={styles.tableHeader}>
              <Text style={styles.colSvc}>Service</Text>
              {showServiceHours && <Text style={styles.colHrs}>Hrs</Text>}
              <Text style={styles.colRate}>Rate</Text>
              <Text style={styles.colAmt}>Amount</Text>
            </View>
            {lineItems.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <View style={styles.cellSvc}>
                  <Text style={styles.cellSvcName}>{item.serviceName}</Text>
                  {item.description ? <Text style={styles.cellSvcDesc}>{item.description}</Text> : null}
                </View>
                {showServiceHours && <Text style={styles.cellHrs}>{item.hours}</Text>}
                <Text style={styles.cellRate}>{fmt(item.rate)}</Text>
                <Text style={styles.cellAmt}>{fmt(item.hours * item.rate)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{showServiceHours ? `${totalHours} hrs — ` : ""}Total Estimate</Text>
              <Text style={styles.totalValue}>{fmt(contract.totalCost)}</Text>
            </View>
          </View>
        )}

        {/* ── Contract Body ── */}
        {blocks.length > 0 && (
          <View style={styles.bodySection}>
            {blocks.map((block, i) => (
              <Text
                key={i}
                style={
                  block.heading
                    ? styles.bodyHeading
                    : block.bullet
                    ? styles.bodyBullet
                    : styles.bodyPara
                }
              >
                {block.text}
              </Text>
            ))}
          </View>
        )}

        {/* ── Not Included in this Scope ── */}
        {contract.notInScope && (
          <View style={styles.notInScopeSection}>
            <Text style={styles.notInScopeHeading}>Not Included in this Scope</Text>
            <Text style={styles.notInScopeBody}>{contract.notInScope}</Text>
          </View>
        )}

        {/* ── Signature ── */}
        {contract.status === "Signed" && (contract.signatureData || contract.signedByName) && (
          <View style={styles.sigSection}>
            <Text style={styles.sigLabel}>Client Signature</Text>
            {isDrawnSig && contract.signatureData ? (
              <Image src={contract.signatureData} style={styles.sigImage} />
            ) : contract.signatureData ? (
              <Text style={styles.sigTyped}>{contract.signatureData}</Text>
            ) : null}
            <View style={styles.sigLine} />
            {contract.signedByName ? (
              <Text style={styles.sigName}>{contract.signedByName}</Text>
            ) : null}
            {signedDate ? (
              <Text style={styles.sigDate}>Signed on {signedDate}</Text>
            ) : null}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {settings?.invoiceFooter ||
              `${settings?.companyName || "Top Tier Transitions"} · Service Agreement · ${tenantName}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderContractPDF(props: ContractPDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<ContractPDF {...props} />) as Promise<Buffer>;
}
