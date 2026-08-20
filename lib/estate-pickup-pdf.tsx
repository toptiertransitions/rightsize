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

// Maximum items rendered per card chunk before splitting to a new card.
// At 46pt per row, 12 items ≈ 600pt which fits comfortably on a LETTER page.
const ITEMS_PER_CHUNK = 12;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Shrink Cloudinary URLs to small, compressed thumbnails so the PDF stays lean.
// The thumbnails are rendered at 36pt; 120px @ q_auto:low is more than enough.
function compressPhotoUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes("cloudinary.com")) return url;
  return url.replace(/\/upload\//, "/upload/w_120,h_120,c_fill,q_auto:low,f_jpg/");
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sage = "#5a7a5e";
const charcoal = "#2C2C2C";
const lightGray = "#f5f5f5";
const contGray = "#ebebeb";
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
  headerLeft: { flexDirection: "column" },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  headerEstate: { fontSize: 9, color: "#aaaaaa", marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  headerLabel: {
    fontSize: 7,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTimestamp: { fontSize: 8, color: "#cccccc", marginTop: 1 },
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
  buyerHeaderCont: {
    backgroundColor: contGray,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  buyerInfo: { flex: 1 },
  buyerName: { fontFamily: "Helvetica-Bold", fontSize: 11, color: charcoal },
  buyerNameCont: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#555555" },
  buyerContact: { fontSize: 8, color: "#555555", marginTop: 2 },
  buyerTotal: { fontFamily: "Helvetica-Bold", fontSize: 10, color: sage },
  // ── Item rows ──────────────────────────────────────────────────────────────
  itemsContainer: { paddingHorizontal: 10, paddingVertical: 6 },
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
  itemPhotoPlaceholder: { width: 36, height: 36, borderRadius: 3, backgroundColor: "#eeeeee" },
  itemNameCol: { flex: 1, flexDirection: "column", gap: 1 },
  itemName: { fontSize: 9, color: charcoal },
  itemBarcode: { fontSize: 7, color: "#888888", fontFamily: "Helvetica" },
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
  footerText: { fontSize: 7, color: "#aaaaaa" },
  pageNum: { fontSize: 7, color: "#aaaaaa" },
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
  const formatted = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });
  return `${formatted} CST`;
}

function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0].toUpperCase();
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return `${last.toUpperCase()}, ${first}`;
}

// ─── Group buyers by email ─────────────────────────────────────────────────────

export function groupBuyers(buyers: StorefrontBuyer[]): BuyerGroup[] {
  const map = new Map<string, BuyerGroup>();
  for (const b of buyers) {
    const key = b.buyerEmail.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: b.buyerName, email: b.buyerEmail, phone: b.buyerPhone || "", items: [] });
    }
    map.get(key)!.items.push({ itemName: b.itemName, purchaseAmount: b.purchaseAmount });
  }
  return Array.from(map.values()).sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
}

// ─── Item rows renderer ───────────────────────────────────────────────────────

interface ItemChunk {
  itemName: string;
  purchaseAmount: number;
  photoUrl?: string;
  barcode?: string;
}

function ItemRows({ chunk }: { chunk: ItemChunk[] }) {
  return (
    <View style={styles.itemsContainer}>
      {chunk.map((item, idx) => {
        const isLast = idx === chunk.length - 1;
        return (
          <View key={idx} style={isLast ? styles.itemRowLast : styles.itemRow}>
            {item.photoUrl ? (
              <Image src={item.photoUrl} style={styles.itemPhoto} />
            ) : (
              <View style={styles.itemPhotoPlaceholder} />
            )}
            <View style={styles.itemNameCol}>
              <Text style={styles.itemName}>{item.itemName}</Text>
              {item.barcode && <Text style={styles.itemBarcode}>#{item.barcode}</Text>}
            </View>
            <Text style={styles.itemPrice}>{fmtMoney(item.purchaseAmount)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Buyer card: first chunk ───────────────────────────────────────────────────

function BuyerCardFirst({
  group, chunk, isLastCard,
}: { group: BuyerGroup; chunk: ItemChunk[]; isLastCard: boolean }) {
  const total = group.items.reduce((s, i) => s + i.purchaseAmount, 0);
  const name = displayName(group.name);
  return (
    <View style={[styles.buyerCard, isLastCard ? { marginBottom: 0 } : {}]} wrap={false}>
      <View style={styles.buyerHeader}>
        <View style={styles.checkbox} />
        <View style={styles.buyerInfo}>
          <Text style={styles.buyerName}>{name}</Text>
          <Text style={styles.buyerContact}>
            {group.email}{group.phone ? `  ·  ${group.phone}` : ""}
          </Text>
        </View>
        <Text style={styles.buyerTotal}>{fmtMoney(total)}</Text>
      </View>
      <ItemRows chunk={chunk} />
    </View>
  );
}

// ─── Buyer card: continuation chunk ───────────────────────────────────────────

function BuyerCardContinued({
  group, chunk, chunkIndex, totalChunks, isLastCard,
}: { group: BuyerGroup; chunk: ItemChunk[]; chunkIndex: number; totalChunks: number; isLastCard: boolean }) {
  const name = displayName(group.name);
  return (
    <View style={[styles.buyerCard, isLastCard ? { marginBottom: 0 } : {}]} wrap={false}>
      <View style={styles.buyerHeaderCont}>
        <View style={styles.checkbox} />
        <View style={styles.buyerInfo}>
          <Text style={styles.buyerNameCont}>
            {name} — Continued ({chunkIndex + 1} of {totalChunks})
          </Text>
        </View>
      </View>
      <ItemRows chunk={chunk} />
    </View>
  );
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

interface PickupSheetProps {
  estate: Estate;
  buyerGroups: BuyerGroup[];
  itemPhotos: Map<string, string>;
  itemBarcodes: Map<string, string>;
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

function PickupSheetDoc({ estate, buyerGroups, itemPhotos, itemBarcodes, printedAt }: PickupSheetProps) {
  // Pre-compute all card chunks across all buyers so we know which is truly last
  interface CardEntry {
    group: BuyerGroup;
    chunk: ItemChunk[];
    chunkIndex: number;
    totalChunks: number;
    isContinuation: boolean;
  }
  const cards: CardEntry[] = [];

  for (const group of buyerGroups) {
    const enriched: ItemChunk[] = group.items.map(item => ({
      itemName: item.itemName,
      purchaseAmount: item.purchaseAmount,
      photoUrl: compressPhotoUrl(itemPhotos.get(item.itemName)),
      barcode: itemBarcodes.get(item.itemName),
    }));
    const chunks = chunkArray(enriched, ITEMS_PER_CHUNK);
    chunks.forEach((chunk, chunkIndex) => {
      cards.push({
        group,
        chunk,
        chunkIndex,
        totalChunks: chunks.length,
        isContinuation: chunkIndex > 0,
      });
    });
  }

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header estate={estate} printedAt={printedAt} />
        <Footer />

        {buyerGroups.length === 0 ? (
          <Text style={{ color: "#888", fontSize: 10, marginTop: 20 }}>No buyers recorded for this estate sale yet.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {buyerGroups.length} {buyerGroups.length === 1 ? "Buyer" : "Buyers"} · Sorted Alphabetically by Last Name
            </Text>
            {cards.map((entry, idx) => {
              const isLastCard = idx === cards.length - 1;
              if (entry.isContinuation) {
                return (
                  <BuyerCardContinued
                    key={`${entry.group.email}-${entry.chunkIndex}`}
                    group={entry.group}
                    chunk={entry.chunk}
                    chunkIndex={entry.chunkIndex}
                    totalChunks={entry.totalChunks}
                    isLastCard={isLastCard}
                  />
                );
              }
              return (
                <BuyerCardFirst
                  key={`${entry.group.email}-0`}
                  group={entry.group}
                  chunk={entry.chunk}
                  isLastCard={isLastCard}
                />
              );
            })}
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
