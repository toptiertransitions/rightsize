"use server";

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Item } from "./types";

const styles = StyleSheet.create({
  page: { backgroundColor: "#fff", fontFamily: "Helvetica", fontSize: 10, padding: 40 },
  header: { backgroundColor: "#2d4a3e", padding: 20, marginBottom: 20, borderRadius: 4 },
  headerText: { color: "#F5F0E8", fontSize: 16, fontFamily: "Helvetica-Bold" },
  subText: { color: "#a8d4bc", fontSize: 10, marginTop: 4 },
  table: { marginTop: 12 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "6 8" },
  tableHeaderCell: { color: "#6b7280", fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #f3f4f6", padding: "8 8" },
  cell: { fontSize: 10, color: "#374151" },
  footer: { marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 12 },
  footerText: { fontSize: 9, color: "#9ca3af" },
  photo: { width: 40, height: 40, objectFit: "cover", borderRadius: 4 },
  col1: { width: "12%" }, col2: { width: "30%" }, col3: { width: "18%" },
  col4: { width: "18%" }, col5: { width: "22%" },
});

interface VendorOutreachPdfProps {
  vendorName: string;
  pocName: string;
  city: string;
  state: string;
  items: Item[];
  sentDate: string;
  logoUrl?: string;
}

function VendorOutreachPdfDocument({ vendorName, pocName, city, state, items, sentDate, logoUrl }: VendorOutreachPdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          {logoUrl && <Image src={logoUrl} style={{ width: 120, height: 40, objectFit: "contain", marginBottom: 8 }} />}
          <Text style={styles.headerText}>Top Tier Transitions</Text>
          <Text style={styles.subText}>Vendor Item List — {city}, {state}</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: "#374151" }}>To: {vendorName} (Attn: {pocName})</Text>
          <Text style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>Date: {sentDate}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.col1]}>Photo</Text>
            <Text style={[styles.tableHeaderCell, styles.col2]}>Item</Text>
            <Text style={[styles.tableHeaderCell, styles.col3]}>Category</Text>
            <Text style={[styles.tableHeaderCell, styles.col4]}>Condition</Text>
            <Text style={[styles.tableHeaderCell, styles.col5]}>Est. Value</Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <View style={styles.col1}>
                {item.photoUrl
                  ? <Image src={item.photoUrl} style={styles.photo} />
                  : <View style={[styles.photo, { backgroundColor: "#f3f4f6" }]} />}
              </View>
              <Text style={[styles.cell, styles.col2]}>{item.itemName}</Text>
              <Text style={[styles.cell, styles.col3]}>{item.category}</Text>
              <Text style={[styles.cell, styles.col4]}>{item.condition}</Text>
              <Text style={[styles.cell, styles.col5]}>{item.valueMid > 0 ? `$${Math.round(item.valueMid).toLocaleString()}` : "—"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Top Tier Transitions · 312-600-3016 · toptiertransitions.com</Text>
          <Text style={[styles.footerText, { marginTop: 4 }]}>Items are available on a first-come basis. Contact your TTT rep to coordinate pickup.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderVendorOutreachPdf(props: VendorOutreachPdfProps): Promise<Buffer> {
  const buffer = await renderToBuffer(<VendorOutreachPdfDocument {...props} />);
  return Buffer.from(buffer);
}
