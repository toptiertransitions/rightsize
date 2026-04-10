import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Item, LocalVendor, InvoiceSettings } from "./types";

const GREEN      = "#2E6B4F";
const LIGHT_GREEN = "#E8F0EC";
const GRAY_900   = "#111827";
const GRAY_600   = "#6B7280";
const GRAY_400   = "#9CA3AF";
const GRAY_100   = "#F3F4F6";
const PHOTO_BG   = "#F3F4F6";

// A4 content width: 595 - 40*2 = 515pt
const CONTENT_W = 515;
const PHOTO_GAP  = 8;

// Photo sizes by column count — square slots, objectFit: contain
const COL_SIZE: Record<1 | 2 | 3, number> = {
  1: 360,
  2: Math.floor((CONTENT_W - PHOTO_GAP) / 2),        // 253
  3: Math.floor((CONTENT_W - PHOTO_GAP * 2) / 3),    // 166
};

// When an item has more than this many photos, spill the rest to a second page
const FIRST_PAGE_PHOTO_LIMIT = 6;

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 48,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
    fontSize: 10,
  },

  // ── Page mini-header (repeats on every item page) ───────────────────────────
  miniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
  },
  miniHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniHeaderLogo: {
    width: 22,
    height: 22,
    objectFit: "contain",
    marginRight: 7,
  },
  miniHeaderCompany: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: GREEN,
  },
  miniHeaderRight: {
    fontSize: 8,
    color: GRAY_600,
    textAlign: "right",
  },

  // ── Item metadata ────────────────────────────────────────────────────────────
  itemLabel: {
    fontSize: 8,
    color: GRAY_400,
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  photoSection: {
    marginBottom: 16,
  },
  photoRow: {
    flexDirection: "row",
    marginBottom: PHOTO_GAP,
  },
  photoSlot: {
    backgroundColor: PHOTO_BG,
  },
  photo: {
    objectFit: "contain",
  },
  singlePhotoWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  overflowNote: {
    fontSize: 8,
    color: GRAY_400,
    textAlign: "center",
    marginTop: 6,
    fontStyle: "italic",
  },

  // ── Item details block ───────────────────────────────────────────────────────
  detailsWrap: {
    marginTop: 12,
  },
  valuePill: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  valueText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: GREEN,
  },
  itemName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: GRAY_900,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  metaBlock: {
    marginRight: 28,
  },
  metaLabel: {
    fontSize: 8,
    color: GRAY_400,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    color: GRAY_900,
  },
  descLabel: {
    fontSize: 8,
    color: GRAY_400,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  descText: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.6,
  },

  // ── Footer (fixed across all pages) ─────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: GRAY_100,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: GRAY_400,
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Decide how many columns to use based on the number of photos being laid out.
 *   1 photo  → 1 column (large centered)
 *   2 photos → 2 columns
 *   3 photos → 3 columns (single clean row)
 *   4 photos → 2 columns (2×2 grid)
 *   5+ photos → 3 columns
 */
function getCols(n: number): 1 | 2 | 3 {
  if (n === 1) return 1;
  if (n === 2 || n === 4) return 2;
  return 3;
}

type Photo = { url: string; publicId: string };

// ── Sub-components ────────────────────────────────────────────────────────────

function PhotoGrid({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return null;
  const cols = getCols(photos.length);
  const size = COL_SIZE[cols];

  if (cols === 1) {
    return (
      <View style={styles.singlePhotoWrap}>
        <View style={[styles.photoSlot, { width: size, height: size }]}>
          <Image src={photos[0].url} style={[styles.photo, { width: size, height: size }]} />
        </View>
      </View>
    );
  }

  const rows = chunk(photos, cols);
  return (
    <View style={styles.photoSection}>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={[
            styles.photoRow,
            ri === rows.length - 1 ? { marginBottom: 0 } : {},
          ]}
        >
          {row.map((p, pi) => (
            <View
              key={pi}
              style={[
                styles.photoSlot,
                { width: size, height: size },
                pi > 0 ? { marginLeft: PHOTO_GAP } : {},
              ]}
            >
              <Image src={p.url} style={[styles.photo, { width: size, height: size }]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ItemDetails({ item }: { item: Item }) {
  const desc = bestDescription(item);
  return (
    <View style={styles.detailsWrap}>
      {item.valueMid > 0 && (
        <View style={styles.valuePill}>
          <Text style={styles.valueText}>Target Value: ${item.valueMid.toLocaleString()}</Text>
        </View>
      )}
      <Text style={styles.itemName}>{item.itemName}</Text>
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
      </View>
      {desc ? (
        <View>
          <Text style={styles.descLabel}>DESCRIPTION</Text>
          <Text style={styles.descText}>{desc}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MiniHeader({
  companyName,
  logoUrl,
  rightText,
}: {
  companyName: string;
  logoUrl?: string;
  rightText: string;
}) {
  return (
    <View style={styles.miniHeader}>
      <View style={styles.miniHeaderLeft}>
        {logoUrl ? <Image src={logoUrl} style={styles.miniHeaderLogo} /> : null}
        <Text style={styles.miniHeaderCompany}>{companyName}</Text>
      </View>
      <Text style={styles.miniHeaderRight}>{rightText}</Text>
    </View>
  );
}

function Footer({ companyName }: { companyName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Confidential — Prepared by {companyName}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export interface VendorFilePDFProps {
  items: Item[];
  vendor: LocalVendor;
  settings: InvoiceSettings | null;
  preparedDate: string;
}

export const VendorFilePDF = ({
  items,
  vendor,
  settings,
  preparedDate,
}: VendorFilePDFProps) => {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl     = settings?.logoUrl || undefined;

  // Build an array of Page elements — one cover page + 1-2 pages per item
  const itemPages = items.flatMap((item, idx) => {
    const allPhotos: Photo[] = item.photos?.length
      ? item.photos
      : item.photoUrl
      ? [{ url: item.photoUrl, publicId: "" }]
      : [];

    const n = allPhotos.length;
    const baseLabel = `Item ${idx + 1} of ${items.length}`;

    // Split: first page gets ≤6 photos; overflow goes to a second page
    const page1Photos   = n > FIRST_PAGE_PHOTO_LIMIT ? allPhotos.slice(0, FIRST_PAGE_PHOTO_LIMIT) : allPhotos;
    const page2Photos   = n > FIRST_PAGE_PHOTO_LIMIT ? allPhotos.slice(FIRST_PAGE_PHOTO_LIMIT) : [];
    const hasSecondPage = page2Photos.length > 0;

    const pages: React.ReactElement[] = [];

    // ── Item page 1 ──────────────────────────────────────────────────────────
    pages.push(
      <Page key={`${item.id}-p1`} size="A4" style={styles.page}>
        <MiniHeader
          companyName={companyName}
          logoUrl={logoUrl}
          rightText={`${baseLabel}${hasSecondPage ? " (1 of 2)" : ""}`}
        />

        <Text style={styles.itemLabel}>
          {baseLabel.toUpperCase()}
          {n > 0 ? `  ·  ${n} PHOTO${n !== 1 ? "S" : ""}` : ""}
        </Text>

        <PhotoGrid photos={page1Photos} />

        {hasSecondPage ? (
          <Text style={styles.overflowNote}>
            {page2Photos.length} more photo{page2Photos.length !== 1 ? "s" : ""} and item details on next page
          </Text>
        ) : (
          <ItemDetails item={item} />
        )}

        <Footer companyName={companyName} />
      </Page>
    );

    // ── Item page 2 (overflow photos + details) ──────────────────────────────
    if (hasSecondPage) {
      pages.push(
        <Page key={`${item.id}-p2`} size="A4" style={styles.page}>
          <MiniHeader
            companyName={companyName}
            logoUrl={logoUrl}
            rightText={`${baseLabel} (2 of 2)`}
          />
          <PhotoGrid photos={page2Photos} />
          <ItemDetails item={item} />
          <Footer companyName={companyName} />
        </Page>
      );
    }

    return pages;
  });

  return (
    <Document>
      {/* ── Cover page ──────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Full header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 36,
            paddingBottom: 22,
            borderBottomWidth: 2,
            borderBottomColor: GREEN,
          }}
        >
          <View>
            {logoUrl ? (
              <Image
                src={logoUrl}
                style={{ width: 54, height: 54, objectFit: "contain", marginBottom: 10 }}
              />
            ) : null}
            <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: GREEN }}>
              {companyName}
            </Text>
            {settings?.companyAddress ? (
              <Text style={{ fontSize: 9, color: GRAY_600, marginTop: 3 }}>
                {settings.companyAddress}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: GRAY_900 }}>
              Vendor Item Report
            </Text>
            <Text style={{ fontSize: 10, color: GRAY_600, marginTop: 6 }}>
              Prepared for: {vendor.vendorName}
            </Text>
            {vendor.email ? (
              <Text style={{ fontSize: 10, color: GRAY_600, marginTop: 2 }}>{vendor.email}</Text>
            ) : null}
            <Text style={{ fontSize: 10, color: GRAY_600, marginTop: 2 }}>
              Date: {preparedDate}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: GREEN, marginTop: 8 }}>
              {items.length} item{items.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        {/* Item summary list */}
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: GRAY_900, marginBottom: 12 }}>
          Items Included
        </Text>
        {items.map((item, i) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: GRAY_100,
            }}
          >
            <Text style={{ fontSize: 9, color: GRAY_400, width: 26 }}>{i + 1}.</Text>
            <Text style={{ fontSize: 10, color: GRAY_900, flex: 1 }}>{item.itemName}</Text>
            {item.category ? (
              <Text style={{ fontSize: 9, color: GRAY_600, width: 110 }}>{item.category}</Text>
            ) : null}
            {item.condition ? (
              <Text style={{ fontSize: 9, color: GRAY_600, width: 80 }}>{item.condition}</Text>
            ) : null}
            {item.valueMid > 0 ? (
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: "Helvetica-Bold",
                  color: GREEN,
                  width: 60,
                  textAlign: "right",
                }}
              >
                ${item.valueMid.toLocaleString()}
              </Text>
            ) : null}
          </View>
        ))}

        <Footer companyName={companyName} />
      </Page>

      {/* ── One or two pages per item ────────────────────────────────────────── */}
      {itemPages}
    </Document>
  );
};

export async function renderVendorFilePDF(props: VendorFilePDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<VendorFilePDF {...props} />) as Promise<Buffer>;
}
