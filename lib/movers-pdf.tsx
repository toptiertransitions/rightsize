import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import type { Item, InvoiceSettings } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    padding: 0,
  },
  pageInner: {
    flex: 1,
    padding: 40,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: "1.5pt solid #e5e7eb",
  },
  logo: {
    maxWidth: 110,
    maxHeight: 44,
    objectFit: "contain",
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#2E6B4F",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerLabel: {
    fontSize: 9,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerDoc: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginTop: 2,
  },
  itemBody: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  photoWrapper: {
    width: 380,
    height: 380,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
    border: "1pt solid #e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  photo: {
    width: 380,
    height: 380,
    objectFit: "contain",
  },
  photoPlaceholder: {
    width: 380,
    height: 380,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: "#d1d5db",
  },
  itemName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  metaPill: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  metaText: {
    fontSize: 9,
    color: "#6b7280",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pageNum: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#d1d5db",
  },
});

interface MoversPDFProps {
  items: Pick<Item, "id" | "itemName" | "photoUrl" | "category" | "condition" | "sizeClass">[];
  settings: Pick<InvoiceSettings, "logoUrl" | "companyName"> | null;
}

export function MoversPDF({ items, settings }: MoversPDFProps) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;

  return (
    <Document title="Movers Item List">
      {items.map((item, idx) => (
        <Page key={item.id} size="LETTER" style={styles.page}>
          <View style={styles.pageInner}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                {logoUrl ? (
                  <Image src={logoUrl} style={styles.logo} />
                ) : (
                  <Text style={styles.companyName}>{companyName}</Text>
                )}
              </View>
              <View style={styles.headerRight}>
                <Text style={styles.headerLabel}>Movers Item List</Text>
                <Text style={styles.headerDoc}>Item {idx + 1} of {items.length}</Text>
              </View>
            </View>

            {/* Item content */}
            <View style={styles.itemBody}>
              {/* Photo */}
              <View style={styles.photoWrapper}>
                {item.photoUrl ? (
                  <Image src={item.photoUrl} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>No Photo</Text>
                  </View>
                )}
              </View>

              {/* Name */}
              <Text style={styles.itemName}>{item.itemName}</Text>

              {/* Meta pills */}
              <View style={styles.metaRow}>
                {item.category ? (
                  <View style={styles.metaPill}>
                    <Text style={styles.metaText}>{item.category}</Text>
                  </View>
                ) : null}
                {item.condition ? (
                  <View style={styles.metaPill}>
                    <Text style={styles.metaText}>{item.condition}</Text>
                  </View>
                ) : null}
                {item.sizeClass ? (
                  <View style={styles.metaPill}>
                    <Text style={styles.metaText}>{item.sizeClass}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Page number */}
            <Text style={styles.pageNum} fixed>
              {companyName} · Movers Item List
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderMoversPDF(props: MoversPDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<MoversPDF {...props} />) as Promise<Buffer>;
}
