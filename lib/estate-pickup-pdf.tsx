import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { StorefrontBuyer, Estate } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuyerGroup {
  name: string;
  email: string;
  phone: string;
  items: {
    itemName: string;
    purchaseAmount: number;
    photoUrl?: string;
  }[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sage = "#5a7a5e";
const charcoal = "#2C2C2C";
const lightGray = "#f5f5f5";
const borderGray = "#e0e0e0";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: charcoal,
    backgroundColor: "#ffffff",
    paddingTop: 90,    // space for fixed header
    paddingBottom: 50,
    paddingHorizontal: 36,
  },
  // ── Fixed header (repeats on every page) ──────────────────────────────────
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: charcoal,
    paddingHorizontal: 36,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "column",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  headerEstate: {
    fontSize: 9,
    color: "#aaaaaa",
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerLabel: {
    fontSize: 7,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTimestamp: {
    fontSize: 8,
    color: "#cccccc",
    marginTop: 1,
  },
  // ── Section title ──────────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: sage,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  // ── Buyer card ─────────────────────────────────────────────────────────────
  buyerCard: {
    backgroundColor: "#ffffff",
    border: `1pt solid ${borderGray}`,
    borderRadius: 4,
    marginBottom: 10,
    overflow: "hidden",
  },
  buyerHeader: {
    backgroundColor: lightGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 14,
    height: 14,
    border: `1.5pt solid #999`,
    borderRadius: 2,
    flexShrink: 0,
  },
  buyerInfo: {
    flex: 1,
  },
  buyerName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: charcoal,
  },
  buyerContact: {
    fontSize: 8,
    color: "#555555",
    marginTop: 2,
  },
  buyerTotal: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: sage,
  },
  // ── Item rows ──────────────────────────────────────────────────────────────
  itemsContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderBottom: `0.5pt solid ${borderGray}`,
    gap: 8,
  },
  itemRowLast: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    gap: 8,
  },
  itemPhoto: {
    width: 36,
    height: 36,
    borderRadius: 3,
    backgroundColor: "#eeeeee",
    objectFit: "cover",
  },
  itemPhotoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 3,
    backgroundColor: "#eeeeee",
  },
  itemNameCol: {
    flex: 1,
    flexDirection: "column",
    gap: 1,
  },
  itemName: {
    fontSize: 9,
    color: charcoal,
  },
  itemBarcode: {
    fontSize: 7,
    color: "#888888",
    fontFamily: "Helvetica",
  },
  itemPrice: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: charcoal,
    minWidth: 55,
    textAlign: "right",
  },
  // ── Page number footer ─────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: `0.5pt solid ${borderGray}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#aaaaaa",
  },
  pageNum: {
    fontSize: 7,
    color: "#aaaaaa",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toUpperCase();
}

function formatPrintTime(): string {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

// ─── Group buyers by email ─────────────────────────────────────────────────────

export function groupBuyers(buyers: StorefrontBuyer[]): BuyerGroup[] {
  const map = new Map<string, BuyerGroup>();
  for (const b of buyers) {
    const key = b.buyerEmail.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: b.buyerName,
        email: b.buyerEmail,
        phone: b.buyerPhone || "",
        items: [],
      });
    }
    map.get(key)!.items.push({
      itemName: b.itemName,
      purchaseAmount: b.purchaseAmount,
    });
  }
  return Array.from(map.values()).sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
}

// ─── PDF Component ─────────────────────────────────────────────────────────────

interface PickupSheetProps {
  estate: Estate;
  buyerGroups: BuyerGroup[];
  itemPhotos: Map<string, string>;    // itemName → photoUrl
  itemBarcodes: Map<string, string>;  // itemName → barcodeNumber
  printedAt: string;
}

function Header({ estate, printedAt }: { estate: Estate; printedAt: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>PROFOUND FINDS — PICKUP SHEET</Text>
        <Text style={styles.headerEstate}>{estate.name}{estate.cityRegion ? ` · ${estate.cityRegion}` : ""}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerLabel}>Printed</Text>
        <Text style={styles.headerTimestamp}>{printedAt}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>ProFound Finds — Confidential Buyer List</Text>
      <Text style={styles.pageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function BuyerCard({ group, itemPhotos, itemBarcodes, isLast }: { group: BuyerGroup; itemPhotos: Map<string, string>; itemBarcodes: Map<string, string>; isLast: boolean }) {
  const total = group.items.reduce((s, i) => s + i.purchaseAmount, 0);
  const [first, ...rest] = group.name.trim().split(/\s+/);
  const last = rest.join(" ") || first;
  const displayName = rest.length > 0 ? `${last.toUpperCase()}, ${first}` : first.toUpperCase();

  return (
    <View style={[styles.buyerCard, isLast ? { marginBottom: 0 } : {}]} wrap={false}>
      {/* Buyer header row */}
      <View style={styles.buyerHeader}>
        <View style={styles.checkbox} />
        <View style={styles.buyerInfo}>
          <Text style={styles.buyerName}>{displayName}</Text>
          <Text style={styles.buyerContact}>
            {group.email}{group.phone ? `  ·  ${group.phone}` : ""}
          </Text>
        </View>
        <Text style={styles.buyerTotal}>{fmtMoney(total)}</Text>
      </View>

      {/* Item rows */}
      <View style={styles.itemsContainer}>
        {group.items.map((item, idx) => {
          const photoUrl = itemPhotos.get(item.itemName);
          const barcode = itemBarcodes.get(item.itemName);
          const isLastItem = idx === group.items.length - 1;
          return (
            <View key={idx} style={isLastItem ? styles.itemRowLast : styles.itemRow}>
              {photoUrl ? (
                <Image src={photoUrl} style={styles.itemPhoto} />
              ) : (
                <View style={styles.itemPhotoPlaceholder} />
              )}
              <View style={styles.itemNameCol}>
                <Text style={styles.itemName}>{item.itemName}</Text>
                {barcode && <Text style={styles.itemBarcode}>#{barcode}</Text>}
              </View>
              <Text style={styles.itemPrice}>{fmtMoney(item.purchaseAmount)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PickupSheetDoc({ estate, buyerGroups, itemPhotos, itemBarcodes, printedAt }: PickupSheetProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header estate={estate} printedAt={printedAt} />
        <Footer />

        {buyerGroups.length === 0 ? (
          <Text style={{ color: "#888", fontSize: 10, marginTop: 20 }}>No buyers recorded for this estate sale yet.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{buyerGroups.length} {buyerGroups.length === 1 ? "Buyer" : "Buyers"} · Sorted Alphabetically by Last Name</Text>
            {buyerGroups.map((group, idx) => (
              <BuyerCard
                key={group.email}
                group={group}
                itemPhotos={itemPhotos}
                itemBarcodes={itemBarcodes}
                isLast={idx === buyerGroups.length - 1}
              />
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function renderPickupSheetPDF(opts: {
  estate: Estate;
  buyers: StorefrontBuyer[];
  items: { itemName: string; photoUrl?: string; barcodeNumber?: string }[];
}): Promise<Buffer> {
  const { estate, buyers, items } = opts;

  // Build itemName → photoUrl and itemName → barcodeNumber maps from Items table
  const itemPhotos = new Map<string, string>();
  const itemBarcodes = new Map<string, string>();
  for (const item of items) {
    if (item.itemName) {
      if (item.photoUrl) itemPhotos.set(item.itemName, item.photoUrl);
      if (item.barcodeNumber) itemBarcodes.set(item.itemName, item.barcodeNumber);
    }
  }

  const buyerGroups = groupBuyers(buyers);
  const printedAt = formatPrintTime();

  const buffer = await renderToBuffer(
    <PickupSheetDoc
      estate={estate}
      buyerGroups={buyerGroups}
      itemPhotos={itemPhotos}
      itemBarcodes={itemBarcodes}
      printedAt={printedAt}
    />
  );
  return buffer;
}
