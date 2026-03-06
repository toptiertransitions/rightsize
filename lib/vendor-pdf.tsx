import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Item, LocalVendor, InvoiceSettings } from "./types";

const GREEN = "#2E6B4F";
const LIGHT_GREEN = "#E8F0EC";
const GRAY_900 = "#111827";
const GRAY_600 = "#6B7280";
const GRAY_400 = "#9CA3AF";
const GRAY_100 = "#F3F4F6";

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingTop: 32,
    paddingBottom: 48,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
    fontSize: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
  },
  headerLeft: { flexDirection: "column" },
  logo: { width: 44, height: 44, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GREEN },
  companyMeta: { fontSize: 8, color: GRAY_600, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  reportTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRAY_900 },
  headerMeta: { fontSize: 9, color: GRAY_600, marginTop: 3 },
  headerCount: { fontSize: 9, color: GREEN, marginTop: 3, fontFamily: "Helvetica-Bold" },
  itemCard: {
    marginBottom: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_100,
  },
  itemNumber: { fontSize: 9, color: GRAY_400, marginBottom: 8 },
  primaryPhoto: { width: "100%", height: 210, objectFit: "cover", borderRadius: 6, marginBottom: 6 },
  additionalRow: { flexDirection: "row", marginBottom: 8 },
  additionalPhoto: { height: 76, objectFit: "cover", borderRadius: 4, flex: 1 },
  additionalPhotoMid: { height: 76, objectFit: "cover", borderRadius: 4, flex: 1, marginHorizontal: 5 },
  valuePill: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  valueText: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GREEN },
  itemName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: GRAY_900, marginBottom: 8 },
  metaRow: { flexDirection: "row", marginBottom: 8 },
  metaBlock: { marginRight: 24 },
  metaLabel: { fontSize: 8, color: GRAY_400, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  metaValue: { fontSize: 10, color: GRAY_900 },
  descLabel: { fontSize: 8, color: GRAY_400, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  descText: { fontSize: 9, color: "#374151", lineHeight: 1.6 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: GRAY_100,
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: GRAY_400 },
});

function bestDescription(item: Item): string {
  return (
    item.listingDescriptionEbay?.trim() ||
    item.listingFb?.trim() ||
    item.listingOfferup?.trim() ||
    item.conditionNotes?.trim() ||
    item.routeReasoning?.trim() ||
    ""
  );
}

export interface VendorFilePDFProps {
  items: Item[];
  vendor: LocalVendor;
  settings: InvoiceSettings | null;
  preparedDate: string;
}

export const VendorFilePDF = ({ items, vendor, settings, preparedDate }: VendorFilePDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header — shown on first page only (not fixed) */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {settings?.logoUrl ? <Image src={settings.logoUrl} style={styles.logo} /> : null}
          <Text style={styles.companyName}>{settings?.companyName || "Top Tier Transitions"}</Text>
          {settings?.companyAddress ? <Text style={styles.companyMeta}>{settings.companyAddress}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.reportTitle}>Vendor Item Report</Text>
          <Text style={styles.headerMeta}>Prepared for: {vendor.vendorName}</Text>
          {vendor.email ? <Text style={styles.headerMeta}>{vendor.email}</Text> : null}
          <Text style={styles.headerMeta}>Date: {preparedDate}</Text>
          <Text style={styles.headerCount}>{items.length} item{items.length !== 1 ? "s" : ""}</Text>
        </View>
      </View>

      {/* Items */}
      {items.map((item, idx) => {
        const allPhotos = item.photos?.length
          ? item.photos
          : item.photoUrl
          ? [{ url: item.photoUrl, publicId: "" }]
          : [];
        const [primary, ...rest] = allPhotos;
        const additional = rest.slice(0, 3);
        const desc = bestDescription(item);

        return (
          <View key={item.id} style={styles.itemCard} wrap={false}>
            <Text style={styles.itemNumber}>Item {idx + 1} of {items.length}</Text>

            {/* Photos */}
            {primary ? (
              <View>
                <Image src={primary.url} style={styles.primaryPhoto} />
                {additional.length > 0 && (
                  <View style={styles.additionalRow}>
                    {additional.map((p, pi) => (
                      <Image
                        key={pi}
                        src={p.url}
                        style={pi === 1 ? styles.additionalPhotoMid : styles.additionalPhoto}
                      />
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* Expected value pill */}
            {item.valueMid > 0 && (
              <View style={styles.valuePill}>
                <Text style={styles.valueText}>${item.valueMid.toLocaleString()}</Text>
              </View>
            )}

            {/* Title */}
            <Text style={styles.itemName}>{item.itemName}</Text>

            {/* Metadata */}
            <View style={styles.metaRow}>
              {item.category ? (
                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>CATEGORY</Text>
                  <Text style={styles.metaValue}>{item.category}</Text>
                </View>
              ) : null}
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>CONDITION</Text>
                <Text style={styles.metaValue}>{item.condition}</Text>
              </View>
              {item.valueLow > 0 && item.valueHigh > 0 ? (
                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>VALUE RANGE</Text>
                  <Text style={styles.metaValue}>
                    ${item.valueLow.toLocaleString()} – ${item.valueHigh.toLocaleString()}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Description */}
            {desc ? (
              <View>
                <Text style={styles.descLabel}>DESCRIPTION</Text>
                <Text style={styles.descText}>{desc}</Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {/* Footer on every page */}
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          Confidential — Prepared by {settings?.companyName || "Top Tier Transitions"}
        </Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  </Document>
);

export async function renderVendorFilePDF(props: VendorFilePDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<VendorFilePDF {...props} />) as Promise<Buffer>;
}
