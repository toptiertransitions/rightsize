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
import type { MoverGroup } from "./anthropic";

// Letter: 612 × 792pt. Margins: 32pt each side → content = 548pt wide.
const CONTENT_W = 548;
const COLS = 3;
const CARD_GAP = 8;
const CARD_W = Math.floor((CONTENT_W - CARD_GAP * (COLS - 1)) / COLS); // ~177pt
const PHOTO_H = 130;
// Photo strip within card: 1 photo = full width, 2 = half, 3 = third
const PHOTO_GAP = 3;

const GREEN = "#2E6B4F";
const GRAY_900 = "#111827";
const GRAY_600 = "#6B7280";
const GRAY_400 = "#9CA3AF";
const GRAY_100 = "#F3F4F6";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: GRAY_900,
    backgroundColor: "#ffffff",
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 44,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: GREEN,
  },
  logo: { maxWidth: 100, maxHeight: 36, objectFit: "contain" },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GREEN },
  headerRight: { alignItems: "flex-end" },
  headerLabel: { fontSize: 8, color: GRAY_400, textTransform: "uppercase", letterSpacing: 0.8 },
  headerDoc: { fontSize: 10, fontFamily: "Helvetica-Bold", color: GRAY_600, marginTop: 2 },

  // ── Summary page ────────────────────────────────────────────────────────────
  summaryTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: GRAY_900, marginBottom: 4 },
  summaryDate: { fontSize: 9, color: GRAY_400, marginBottom: 22 },
  sectionLabel: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY_400,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5,
  },
  tableHeaderRow: {
    flexDirection: "row", paddingHorizontal: 8, paddingBottom: 5,
    borderBottomWidth: 1.5, borderBottomColor: "#d1d5db", marginBottom: 1,
  },
  tableHeaderItem: { flex: 1, fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY_600, textTransform: "uppercase", letterSpacing: 0.6 },
  tableHeaderQty: { width: 34, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY_600, textTransform: "uppercase", letterSpacing: 0.6 },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: GRAY_100 },
  tableRowAlt: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: GRAY_100, backgroundColor: "#f9fafb" },
  tableItemName: { flex: 1, fontSize: 10, color: GRAY_900 },
  tableQty: { width: 34, textAlign: "right", fontSize: 10, fontFamily: "Helvetica-Bold", color: "#374151" },
  totalRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: "#374151", marginTop: 1 },
  totalLabel: { flex: 1, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#374151" },
  totalQty: { width: 34, textAlign: "right", fontSize: 10, fontFamily: "Helvetica-Bold", color: "#374151" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 16 },
  addressBlock: { flexDirection: "row", gap: 36, marginBottom: 16 },
  addressRow: { flexDirection: "column", gap: 2 },
  addressLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY_400, textTransform: "uppercase", letterSpacing: 0.8 },
  addressValue: { fontSize: 9, color: "#374151" },
  sizeGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sizePill: { flexDirection: "row", alignItems: "center", backgroundColor: GRAY_100, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, gap: 6 },
  sizePillCount: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GRAY_900 },
  sizePillLabel: { fontSize: 8, color: GRAY_600, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },

  // ── Grid layout ─────────────────────────────────────────────────────────────
  gridPageLabel: {
    fontSize: 8, color: GRAY_400, marginBottom: 10,
    fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6,
  },
  gridRow: { flexDirection: "row", gap: CARD_GAP, marginBottom: CARD_GAP },

  // ── Item card ───────────────────────────────────────────────────────────────
  card: {
    width: CARD_W,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "#e5e7eb",
  },
  // Photo strip (1–3 photos side by side)
  photoStrip: { flexDirection: "row", height: PHOTO_H, backgroundColor: GRAY_100 },
  cardNoPhoto: { width: CARD_W, height: PHOTO_H, backgroundColor: GRAY_100, alignItems: "center", justifyContent: "center" },
  cardNoPhotoText: { fontSize: 8, color: "#d1d5db" },
  cardBody: { padding: 6 },
  cardName: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY_900, marginBottom: 4, lineHeight: 1.3 },
  cardPills: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  cardPill: { backgroundColor: "#e5e7eb", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  cardPillText: { fontSize: 6.5, color: GRAY_600, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },
  // "+N more" overlay on last photo slot
  moreOverlay: {
    position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  moreText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff" },

  // ── Footer ──────────────────────────────────────────────────────────────────
  pageNum: { position: "absolute", bottom: 18, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#d1d5db" },
});

type Photo = { url: string };
type ItemSlim = {
  id: string;
  itemName: string;
  photoUrl?: string;
  photos?: Photo[];
  category?: string;
  condition?: string;
  sizeClass?: string;
};

interface MoversPDFProps {
  items: ItemSlim[];
  settings: Pick<InvoiceSettings, "logoUrl" | "companyName"> | null;
  aiGroups?: MoverGroup[];
  originAddress?: string;
  destinationAddress?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildItemCounts(items: ItemSlim[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = (item.itemName || "Unnamed Item").trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildSizeCounts(items: ItemSlim[]): { label: string; count: number }[] {
  const ORDER = ["Needs Movers", "Fits in Car-SUV", "Small & Shippable"];
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.sizeClass || "Unspecified";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const known = ORDER.filter(k => map.has(k)).map(k => ({ label: k, count: map.get(k)! }));
  const other = [...map.entries()].filter(([k]) => !ORDER.includes(k)).map(([label, count]) => ({ label, count }));
  return [...known, ...other];
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function getPhotos(item: ItemSlim): Photo[] {
  if (item.photos?.length) return item.photos.filter(p => p.url);
  if (item.photoUrl) return [{ url: item.photoUrl }];
  return [];
}

// ─── Header component ─────────────────────────────────────────────────────────
function PageHeader({ companyName, logoUrl, docLabel }: { companyName: string; logoUrl: string | null; docLabel: string }) {
  return (
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
        <Text style={styles.headerDoc}>{docLabel}</Text>
      </View>
    </View>
  );
}

// ─── Photo strip (up to 3 photos side by side inside a card) ─────────────────
const MAX_VISIBLE = 3;

function CardPhotoStrip({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) {
    return (
      <View style={styles.cardNoPhoto}>
        <Text style={styles.cardNoPhotoText}>No Photo</Text>
      </View>
    );
  }

  const visible = photos.slice(0, MAX_VISIBLE);
  const extra   = Math.max(0, photos.length - MAX_VISIBLE);
  const count   = visible.length;
  // Each photo slot width = (CARD_W - gaps) / count
  const slotW   = Math.floor((CARD_W - PHOTO_GAP * (count - 1)) / count);

  return (
    <View style={styles.photoStrip}>
      {visible.map((p, i) => {
        const isLast = i === visible.length - 1;
        return (
          <View
            key={i}
            style={{
              width: slotW,
              height: PHOTO_H,
              marginLeft: i > 0 ? PHOTO_GAP : 0,
              position: "relative",
              backgroundColor: GRAY_100,
            }}
          >
            <Image
              src={p.url}
              style={{ width: slotW, height: PHOTO_H, objectFit: "cover" }}
            />
            {/* Overlay "+N" on last visible slot if there are hidden photos */}
            {isLast && extra > 0 && (
              <View style={styles.moreOverlay}>
                <Text style={styles.moreText}>+{extra}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────
function ItemCard({ item }: { item: ItemSlim }) {
  const photos = getPhotos(item);
  return (
    <View style={styles.card}>
      <CardPhotoStrip photos={photos} />
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>
          {(item.itemName || "Unnamed Item").slice(0, 60)}
        </Text>
        <View style={styles.cardPills}>
          {item.sizeClass ? (
            <View style={styles.cardPill}>
              <Text style={styles.cardPillText}>{item.sizeClass}</Text>
            </View>
          ) : null}
          {item.condition ? (
            <View style={styles.cardPill}>
              <Text style={styles.cardPillText}>{item.condition}</Text>
            </View>
          ) : null}
          {item.category ? (
            <View style={styles.cardPill}>
              <Text style={styles.cardPillText}>{item.category}</Text>
            </View>
          ) : null}
          {photos.length > 1 && (
            <View style={[styles.cardPill, { backgroundColor: "#dbeafe" }]}>
              <Text style={[styles.cardPillText, { color: "#1d4ed8" }]}>{photos.length} photos</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Summary page ─────────────────────────────────────────────────────────────
function SummaryPage({ items, settings, aiGroups, originAddress, destinationAddress }: MoversPDFProps) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const useAI = aiGroups && aiGroups.length > 0;
  const itemRows = useAI ? aiGroups.map(g => ({ name: g.category, count: g.count })) : buildItemCounts(items);
  const sizeRows = buildSizeCounts(items);

  return (
    <Page size="LETTER" style={styles.page}>
      <PageHeader companyName={companyName} logoUrl={logoUrl} docLabel="Summary" />

      <Text style={styles.summaryTitle}>Moving Summary</Text>
      <Text style={styles.summaryDate}>
        Generated {date} · {items.length} item{items.length !== 1 ? "s" : ""} — To Be Moved
      </Text>

      {(originAddress || destinationAddress) && (
        <View style={styles.addressBlock}>
          {originAddress && (
            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>From</Text>
              <Text style={styles.addressValue}>{originAddress}</Text>
            </View>
          )}
          {destinationAddress && (
            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>To</Text>
              <Text style={styles.addressValue}>{destinationAddress}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.sectionLabel}>{useAI ? "Items by Category (AI Grouped)" : "Items"}</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={styles.tableHeaderItem}>Item</Text>
        <Text style={styles.tableHeaderQty}>Qty</Text>
      </View>
      {itemRows.map(({ name, count }, i) => (
        <View key={name} style={i % 2 === 1 ? styles.tableRowAlt : styles.tableRow}>
          <Text style={styles.tableItemName}>{name}</Text>
          <Text style={styles.tableQty}>{count}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Items</Text>
        <Text style={styles.totalQty}>{items.length}</Text>
      </View>

      {sizeRows.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>By Size</Text>
          <View style={styles.sizeGrid}>
            {sizeRows.map(({ label, count }) => (
              <View key={label} style={styles.sizePill}>
                <Text style={styles.sizePillCount}>{count}</Text>
                <Text style={styles.sizePillLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.pageNum} fixed>
        {companyName} · Movers Item List
      </Text>
    </Page>
  );
}

// ─── Grid pages ───────────────────────────────────────────────────────────────
const ROWS_PER_PAGE = 4;
const ITEMS_PER_PAGE = COLS * ROWS_PER_PAGE;

function GridPages({ items, settings }: { items: ItemSlim[]; settings: MoversPDFProps["settings"] }) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;
  const pages = chunk(items, ITEMS_PER_PAGE);
  const totalPages = pages.length;

  return (
    <>
      {pages.map((pageItems, pageIdx) => {
        const rows = chunk(pageItems, COLS);
        return (
          <Page key={pageIdx} size="LETTER" style={styles.page}>
            <PageHeader
              companyName={companyName}
              logoUrl={logoUrl}
              docLabel={`Items — Page ${pageIdx + 1} of ${totalPages}`}
            />
            <Text style={styles.gridPageLabel}>
              Items {pageIdx * ITEMS_PER_PAGE + 1}–{Math.min((pageIdx + 1) * ITEMS_PER_PAGE, items.length)} of {items.length}
            </Text>
            {rows.map((rowItems, rowIdx) => (
              <View key={rowIdx} style={styles.gridRow}>
                {rowItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
                {rowItems.length < COLS &&
                  Array.from({ length: COLS - rowItems.length }).map((_, k) => (
                    <View key={`empty-${k}`} style={{ width: CARD_W }} />
                  ))}
              </View>
            ))}
            <Text style={styles.pageNum} fixed>
              {companyName} · Movers Item List
            </Text>
          </Page>
        );
      })}
    </>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────
export function MoversPDF({ items, settings, aiGroups, originAddress, destinationAddress }: MoversPDFProps) {
  return (
    <Document title="Movers Item List">
      <SummaryPage
        items={items}
        settings={settings}
        aiGroups={aiGroups}
        originAddress={originAddress}
        destinationAddress={destinationAddress}
      />
      <GridPages items={items} settings={settings} />
    </Document>
  );
}

export async function renderMoversPDF(props: MoversPDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<MoversPDF {...props} />) as Promise<Buffer>;
}
