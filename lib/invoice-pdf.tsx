import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceSettings } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    padding: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  logo: {
    maxWidth: 120,
    maxHeight: 50,
    objectFit: "contain",
  },
  companyBlock: {
    alignItems: "flex-start",
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#2E6B4F",
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  invoiceMeta: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#2E6B4F",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  metaLabel: {
    fontSize: 9,
    color: "#6b7280",
    width: 80,
  },
  metaValue: {
    fontSize: 9,
    color: "#374151",
    fontFamily: "Helvetica-Bold",
  },
  divider: {
    borderBottom: "1pt solid #e5e7eb",
    marginBottom: 24,
  },
  toBlock: {
    marginBottom: 24,
  },
  toLabel: {
    fontSize: 9,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  toValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    padding: "8 12",
    borderBottom: "1pt solid #e5e7eb",
  },
  tableRow: {
    flexDirection: "row",
    padding: "8 12",
    borderBottom: "1pt solid #f3f4f6",
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: "8 12",
    backgroundColor: "#f9fafb",
    borderBottom: "1pt solid #f3f4f6",
  },
  totalRow: {
    flexDirection: "row",
    padding: "10 12",
    backgroundColor: "#f0fdf4",
    borderTop: "2pt solid #2E6B4F",
  },
  colService: { flex: 3, fontSize: 9, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  colHrs: { flex: 1, fontSize: 9, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  colRate: { flex: 1, fontSize: 9, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  colAmount: { flex: 1.5, fontSize: 9, color: "#6b7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right" },
  cellService: { flex: 3, fontSize: 10, color: "#374151" },
  cellHrs: { flex: 1, fontSize: 10, color: "#374151", textAlign: "right" },
  cellRate: { flex: 1, fontSize: 10, color: "#374151", textAlign: "right" },
  cellAmount: { flex: 1.5, fontSize: 10, color: "#374151", textAlign: "right" },
  totalLabel: { flex: 5, fontSize: 11, fontFamily: "Helvetica-Bold", color: "#2E6B4F" },
  totalValue: { flex: 1.5, fontSize: 11, fontFamily: "Helvetica-Bold", color: "#2E6B4F", textAlign: "right" },
  paymentSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    borderLeft: "3pt solid #2E6B4F",
  },
  paymentLabel: {
    fontSize: 9,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paymentLink: {
    fontSize: 10,
    color: "#2E6B4F",
    textDecoration: "underline",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    borderTop: "1pt solid #e5e7eb",
    paddingTop: 12,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InvoicePDFProps {
  invoice: Invoice;
  tenantName: string;
  settings: InvoiceSettings;
  payUrl?: string;
}

export function InvoicePDF({ invoice, tenantName, settings, payUrl }: InvoicePDFProps) {
  const dateStr = new Date(invoice.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build line items — for Full invoices with lineItems array, or single-row for deposit
  const lineItems =
    invoice.lineItems && invoice.lineItems.length > 0
      ? invoice.lineItems
      : [{ serviceId: invoice.serviceId, serviceName: invoice.serviceName, hours: 1, rate: invoice.amount }];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            {settings.logoUrl ? (
              <Image src={settings.logoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>{settings.companyName || "Company"}</Text>
            {settings.companyAddress ? (
              <Text style={styles.companyDetail}>{settings.companyAddress}</Text>
            ) : null}
            {settings.companyPhone ? (
              <Text style={styles.companyDetail}>{settings.companyPhone}</Text>
            ) : null}
            {settings.companyEmail ? (
              <Text style={styles.companyDetail}>{settings.companyEmail}</Text>
            ) : null}
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice #</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{dateStr}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Type</Text>
              <Text style={styles.metaValue}>{invoice.type} Invoice</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{invoice.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill To */}
        <View style={styles.toBlock}>
          <Text style={styles.toLabel}>Bill To</Text>
          <Text style={styles.toValue}>{tenantName}</Text>
        </View>

        {/* Line Items Table */}
        <View style={{ border: "1pt solid #e5e7eb", borderRadius: 6, overflow: "hidden", marginBottom: 0 }}>
          <View style={styles.tableHeader}>
            <Text style={styles.colService}>Service</Text>
            <Text style={styles.colHrs}>Hrs</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={styles.cellService}>{item.serviceName}</Text>
              <Text style={styles.cellHrs}>{item.hours}</Text>
              <Text style={styles.cellRate}>{fmt(item.rate)}</Text>
              <Text style={styles.cellAmount}>{fmt(item.hours * item.rate)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Due</Text>
            <Text style={styles.totalValue}>{fmt(invoice.amount)}</Text>
          </View>
        </View>

        {/* Pay Now */}
        {payUrl ? (
          <View style={styles.paymentSection}>
            <Text style={styles.paymentLabel}>Pay Now</Text>
            <Text style={styles.paymentLink}>{payUrl}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {settings.invoiceFooter || `${settings.companyName || ""}${invoice.invoiceNumber ? ` · Invoice ${invoice.invoiceNumber}` : ""}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePDF(props: InvoicePDFProps & { payUrl?: string }): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<InvoicePDF {...props} />) as Promise<Buffer>;
}
