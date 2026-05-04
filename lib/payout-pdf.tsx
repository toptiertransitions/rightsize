import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface PayoutLineItem {
  itemName: string;
  channel: string; // "ProFoundFinds" | "FB/Marketplace" | "Online Marketplace"
  saleDate: string;
  clientPayout: number;
}

export interface PayoutPDFProps {
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
  date: string;
  items: PayoutLineItem[];
  expenseDeduction?: number;
  expenseNote?: string;
}

const GREEN = "#2E6B4F";
const GRAY = "#6b7280";
const LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";
const DARK = "#1a1a1a";
const MID = "#374151";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: DARK, padding: 40, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { maxWidth: 110, maxHeight: 44, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: GREEN, marginBottom: 3 },
  companyDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: GREEN, marginBottom: 6 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { fontSize: 8, color: GRAY, width: 60 },
  metaValue: { fontSize: 8, color: MID, fontFamily: "Helvetica-Bold" },
  divider: { borderBottom: `1pt solid ${BORDER}`, marginBottom: 20 },
  toBlock: { marginBottom: 20 },
  toLabel: { fontSize: 8, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  toName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: DARK, marginBottom: 2 },
  toDetail: { fontSize: 9, color: GRAY },
  table: { border: `1pt solid ${BORDER}`, borderRadius: 4, overflow: "hidden", marginBottom: 0 },
  tableHead: { flexDirection: "row", backgroundColor: LIGHT, padding: "8 12", borderBottom: `1pt solid ${BORDER}` },
  tableRow: { flexDirection: "row", padding: "8 12", borderBottom: `1pt solid #f3f4f6` },
  tableRowAlt: { flexDirection: "row", padding: "8 12", backgroundColor: LIGHT, borderBottom: `1pt solid #f3f4f6` },
  deductRow: { flexDirection: "row", padding: "8 12", backgroundColor: "#fff7f7", borderBottom: `1pt solid #fee2e2` },
  totalRow: { flexDirection: "row", padding: "10 12", backgroundColor: "#f0fdf4", borderTop: `2pt solid ${GREEN}` },
  colItem: { flex: 3.5, fontSize: 9, color: GRAY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  colChannel: { flex: 2, fontSize: 9, color: GRAY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  colDate: { flex: 1.5, fontSize: 9, color: GRAY, fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  colPayout: { flex: 1.5, fontSize: 9, color: GRAY, fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  cellItem: { flex: 3.5, fontSize: 9, color: MID },
  cellChannel: { flex: 2, fontSize: 9, color: GRAY },
  cellDate: { flex: 1.5, fontSize: 9, color: MID, textAlign: "right" },
  cellPayout: { flex: 1.5, fontSize: 9, color: MID, textAlign: "right" },
  deductLabel: { flex: 7, fontSize: 9, color: "#dc2626" },
  deductValue: { flex: 1.5, fontSize: 9, color: "#dc2626", textAlign: "right" },
  totalLabel: { flex: 7, fontSize: 11, fontFamily: "Helvetica-Bold", color: GREEN },
  totalValue: { flex: 1.5, fontSize: 11, fontFamily: "Helvetica-Bold", color: GREEN, textAlign: "right" },
  note: { marginTop: 20, padding: 12, backgroundColor: LIGHT, borderLeft: `3pt solid ${GREEN}`, borderRadius: 4 },
  noteText: { fontSize: 8, color: GRAY, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, borderTop: `1pt solid ${BORDER}`, paddingTop: 10 },
  footerText: { fontSize: 7, color: "#9ca3af", textAlign: "center" },
});

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

export function PayoutPDF({
  clientName, clientAddress, clientEmail,
  companyName, companyAddress, companyPhone, companyEmail, logoUrl,
  date, items, expenseDeduction = 0, expenseNote,
}: PayoutPDFProps) {
  const subtotal = items.reduce((s, i) => s + i.clientPayout, 0);
  const total = Math.max(0, subtotal - expenseDeduction);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <Text style={s.companyName}>{companyName}</Text>
            {companyAddress ? <Text style={s.companyDetail}>{companyAddress}</Text> : null}
            {companyPhone ? <Text style={s.companyDetail}>{companyPhone}</Text> : null}
            {companyEmail ? <Text style={s.companyDetail}>{companyEmail}</Text> : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>PAYOUT STATEMENT</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{fmtDate(date)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Items</Text>
              <Text style={s.metaValue}>{items.length}</Text>
            </View>
            {expenseDeduction > 0 && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Expenses</Text>
                <Text style={s.metaValue}>-{fmt(expenseDeduction)}</Text>
              </View>
            )}
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Net Payout</Text>
              <Text style={s.metaValue}>{fmt(total)}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Client */}
        <View style={s.toBlock}>
          <Text style={s.toLabel}>Prepared for</Text>
          <Text style={s.toName}>{clientName}</Text>
          {clientAddress ? <Text style={s.toDetail}>{clientAddress}</Text> : null}
          {clientEmail ? <Text style={s.toDetail}>{clientEmail}</Text> : null}
        </View>

        {/* Items table */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={s.colItem}>Item</Text>
            <Text style={s.colChannel}>Channel</Text>
            <Text style={s.colDate}>Sale Date</Text>
            <Text style={s.colPayout}>Your Payout</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={s.cellItem}>{item.itemName}</Text>
              <Text style={s.cellChannel}>{item.channel}</Text>
              <Text style={s.cellDate}>{fmtDate(item.saleDate)}</Text>
              <Text style={s.cellPayout}>{fmt(item.clientPayout)}</Text>
            </View>
          ))}
          {expenseDeduction > 0 && (
            <View style={s.deductRow}>
              <Text style={s.deductLabel}>
                Expenses Deducted{expenseNote ? ` — ${expenseNote}` : ""}
              </Text>
              <Text style={s.deductValue}>-{fmt(expenseDeduction)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Net Payout</Text>
            <Text style={s.totalValue}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Note */}
        <View style={s.note}>
          <Text style={s.noteText}>
            This statement reflects your share of proceeds from items sold on your behalf.
            {companyName ? ` Please contact ${companyName} with any questions.` : ""}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {companyName} · Payout Statement · {fmtDate(date)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayoutPDF(props: PayoutPDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<PayoutPDF {...props} />) as Promise<Buffer>;
}
