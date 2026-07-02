import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvoiceSettings } from "./types";
import type { MoverGroup } from "./anthropic";

// ─── Page geometry ────────────────────────────────────────────────────────────
const ML    = 36;              // left/right margin
const MT    = 26;              // top margin
const MB    = 44;              // bottom margin
const CW    = 612 - ML * 2;   // content width = 540

// ─── Brand ───────────────────────────────────────────────────────────────────
const GREEN    = "#2E6B4F";
const GREEN_BG = "#EAF3EE";
const G900     = "#111827";
const G700     = "#374151";
const G500     = "#6B7280";
const G300     = "#D1D5DB";
const G100     = "#F3F4F6";

// ─── Photo area: fixed 210 pt tall, capped at 4 photos ───────────────────────
const PH   = 210;  // total photo block height
const PGAP = 7;    // gap between photos in grid

const MAX_PHOTOS = 4;

// ─── StyleSheet ──────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: G900,
    backgroundColor: "#ffffff",
    paddingHorizontal: ML,
    paddingTop: MT,
    paddingBottom: MB,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
  },
  logo: { maxWidth: 110, maxHeight: 34, objectFit: "contain" },
  coName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: GREEN },
  hdrRight: { alignItems: "flex-end" },
  hdrSub: { fontSize: 7.5, color: G500, textTransform: "uppercase", letterSpacing: 0.9 },
  hdrPg: { fontSize: 9, fontFamily: "Helvetica-Bold", color: G700, marginTop: 2 },

  // Item block
  numBadge: {
    backgroundColor: GREEN,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  numText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff" },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: G900,
  },
  noPhoto: {
    width: CW,
    height: PH,
    backgroundColor: G100,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: G300,
  },
  noPhotoTxt: { fontSize: 10, color: G300 },

  // Pills
  pill: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.5,
  },

  // Dashed divider between 2 items on a page
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: G300,
    borderStyle: "dashed",
    marginVertical: 9,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 14,
    left: ML,
    right: ML,
    textAlign: "center",
    fontSize: 7,
    color: G300,
  },

  // ── Summary page ────────────────────────────────────────────────────────────
  sumTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: G900, marginBottom: 3 },
  sumDate: { fontSize: 9, color: G500, marginBottom: 20 },
  secLabel: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: G500,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6,
  },
  tblHdrRow: {
    flexDirection: "row", paddingHorizontal: 8, paddingBottom: 5,
    borderBottomWidth: 1.5, borderBottomColor: G300, marginBottom: 1,
  },
  tblHdrCell: { flex: 1, fontSize: 7, fontFamily: "Helvetica-Bold", color: G500, textTransform: "uppercase", letterSpacing: 0.5 },
  tblHdrQty: { width: 36, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: G500, textTransform: "uppercase" },
  tblRow: { flexDirection: "row", paddingVertical: 5.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: G100 },
  tblRowAlt: { flexDirection: "row", paddingVertical: 5.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: G100, backgroundColor: "#f9fafb" },
  tblName: { flex: 1, fontSize: 9.5, color: G900 },
  tblQty: { width: 36, textAlign: "right", fontSize: 9.5, fontFamily: "Helvetica-Bold", color: G700 },
  totalRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: G700, marginTop: 2 },
  totalLbl: { flex: 1, fontSize: 10, fontFamily: "Helvetica-Bold", color: G700 },
  totalQty: { width: 36, textAlign: "right", fontSize: 10, fontFamily: "Helvetica-Bold", color: G700 },
  horzDiv: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 16 },
  addrBlock: { flexDirection: "row", gap: 40, marginBottom: 18 },
  addrLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: G500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  addrVal: { fontSize: 9, color: G700 },
  sizeGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sizePill: {
    backgroundColor: GREEN_BG, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 0.5, borderColor: GREEN,
  },
  sizeCnt: { fontSize: 18, fontFamily: "Helvetica-Bold", color: GREEN },
  sizeLbl: { fontSize: 8, color: GREEN, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },
});

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getPhotos(item: ItemSlim): Photo[] {
  const all = item.photos?.length
    ? item.photos.filter(p => p.url)
    : item.photoUrl
    ? [{ url: item.photoUrl }]
    : [];
  return all.slice(0, MAX_PHOTOS);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildItemCounts(items: ItemSlim[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = (item.itemName || "Unnamed Item").trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildSizeCounts(items: ItemSlim[]) {
  const ORDER = ["Needs Movers", "Fits in Car-SUV", "Small & Shippable"];
  const map = new Map<string, number>();
  for (const item of items) map.set(item.sizeClass || "Unspecified", (map.get(item.sizeClass || "Unspecified") ?? 0) + 1);
  const known = ORDER.filter(k => map.has(k)).map(k => ({ label: k, count: map.get(k)! }));
  const other = [...map.entries()].filter(([k]) => !ORDER.includes(k)).map(([label, count]) => ({ label, count }));
  return [...known, ...other];
}

// ─── Photo grid (0–4 photos, fixed PH height) ─────────────────────────────────
function PhotoGrid({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) {
    return (
      <View style={S.noPhoto}>
        <Text style={S.noPhotoTxt}>No Photo</Text>
      </View>
    );
  }

  if (photos.length === 1) {
    return (
      <View style={{ width: CW, height: PH, borderRadius: 5, overflow: "hidden", backgroundColor: G100 }}>
        <Image src={photos[0].url} style={{ width: CW, height: PH, objectFit: "cover" }} />
      </View>
    );
  }

  if (photos.length === 2) {
    const w = (CW - PGAP) / 2;
    return (
      <View style={{ flexDirection: "row", gap: PGAP, height: PH }}>
        {photos.map((p, i) => (
          <View key={i} style={{ width: w, height: PH, borderRadius: 5, overflow: "hidden", backgroundColor: G100 }}>
            <Image src={p.url} style={{ width: w, height: PH, objectFit: "cover" }} />
          </View>
        ))}
      </View>
    );
  }

  if (photos.length === 3) {
    // Large top photo + two thumbnails side by side below
    const mainH = Math.round(PH * 0.59);
    const thumbH = PH - mainH - PGAP;
    const thumbW = (CW - PGAP) / 2;
    return (
      <View style={{ height: PH }}>
        <View style={{ width: CW, height: mainH, borderRadius: 5, overflow: "hidden", backgroundColor: G100 }}>
          <Image src={photos[0].url} style={{ width: CW, height: mainH, objectFit: "cover" }} />
        </View>
        <View style={{ flexDirection: "row", gap: PGAP, marginTop: PGAP }}>
          {photos.slice(1).map((p, i) => (
            <View key={i} style={{ width: thumbW, height: thumbH, borderRadius: 4, overflow: "hidden", backgroundColor: G100 }}>
              <Image src={p.url} style={{ width: thumbW, height: thumbH, objectFit: "cover" }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // 4 photos — 2×2 grid
  const cellW = (CW - PGAP) / 2;
  const cellH = (PH - PGAP) / 2;
  return (
    <View style={{ height: PH }}>
      <View style={{ flexDirection: "row", gap: PGAP }}>
        {photos.slice(0, 2).map((p, i) => (
          <View key={i} style={{ width: cellW, height: cellH, borderRadius: 5, overflow: "hidden", backgroundColor: G100 }}>
            <Image src={p.url} style={{ width: cellW, height: cellH, objectFit: "cover" }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: PGAP, marginTop: PGAP }}>
        {photos.slice(2, 4).map((p, i) => (
          <View key={i} style={{ width: cellW, height: cellH, borderRadius: 4, overflow: "hidden", backgroundColor: G100 }}>
            <Image src={p.url} style={{ width: cellW, height: cellH, objectFit: "cover" }} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Page header ─────────────────────────────────────────────────────────────
function PageHeader({ companyName, logoUrl, label }: { companyName: string; logoUrl: string | null; label: string }) {
  return (
    <View style={S.header}>
      <View>
        {logoUrl
          ? <Image src={logoUrl} style={S.logo} />
          : <Text style={S.coName}>{companyName}</Text>}
      </View>
      <View style={S.hdrRight}>
        <Text style={S.hdrSub}>Movers Item List</Text>
        <Text style={S.hdrPg}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Single item block ────────────────────────────────────────────────────────
function ItemBlock({ item, number, total }: { item: ItemSlim; number: number; total: number }) {
  const photos = getPhotos(item);
  const extraCount = (item.photos?.filter(p => p.url).length ?? 0) - MAX_PHOTOS;

  return (
    <View>
      {/* Number badge + item name */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={S.numBadge}>
          <Text style={S.numText}>
            {String(number).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </Text>
        </View>
        <Text style={S.itemName}>
          {(item.itemName || "Unnamed Item").slice(0, 72)}
        </Text>
      </View>

      {/* Photos */}
      <PhotoGrid photos={photos} />

      {/* Metadata pills */}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {item.sizeClass ? (
          <View style={[S.pill, { backgroundColor: GREEN_BG, borderColor: GREEN }]}>
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: GREEN }}>{item.sizeClass}</Text>
          </View>
        ) : null}
        {item.condition ? (
          <View style={[S.pill, { backgroundColor: G100, borderColor: G300 }]}>
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: G500 }}>{item.condition}</Text>
          </View>
        ) : null}
        {item.category ? (
          <View style={[S.pill, { backgroundColor: G100, borderColor: G300 }]}>
            <Text style={{ fontSize: 7.5, color: G500 }}>{item.category}</Text>
          </View>
        ) : null}
        {extraCount > 0 ? (
          <View style={[S.pill, { backgroundColor: "#dbeafe", borderColor: "#93c5fd" }]}>
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1d4ed8" }}>+{extraCount} more photos</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Summary page ─────────────────────────────────────────────────────────────
function SummaryPage({ items, settings, aiGroups, originAddress, destinationAddress }: MoversPDFProps) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const useAI = !!aiGroups?.length;
  const itemRows = useAI ? aiGroups!.map(g => ({ name: g.category, count: g.count })) : buildItemCounts(items);
  const sizeRows = buildSizeCounts(items);

  return (
    <Page size="LETTER" style={S.page}>
      <PageHeader companyName={companyName} logoUrl={logoUrl} label="Summary" />

      <Text style={S.sumTitle}>Moving Summary</Text>
      <Text style={S.sumDate}>
        Generated {date} · {items.length} item{items.length !== 1 ? "s" : ""} — To Be Moved
      </Text>

      {(originAddress || destinationAddress) && (
        <View style={S.addrBlock}>
          {originAddress && (
            <View>
              <Text style={S.addrLabel}>From</Text>
              <Text style={S.addrVal}>{originAddress}</Text>
            </View>
          )}
          {destinationAddress && (
            <View>
              <Text style={S.addrLabel}>To</Text>
              <Text style={S.addrVal}>{destinationAddress}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={S.secLabel}>{useAI ? "Items by Category (AI Grouped)" : "Items"}</Text>
      <View style={S.tblHdrRow}>
        <Text style={S.tblHdrCell}>Item</Text>
        <Text style={S.tblHdrQty}>Qty</Text>
      </View>
      {itemRows.map(({ name, count }, i) => (
        <View key={name} style={i % 2 === 1 ? S.tblRowAlt : S.tblRow}>
          <Text style={S.tblName}>{name}</Text>
          <Text style={S.tblQty}>{count}</Text>
        </View>
      ))}
      <View style={S.totalRow}>
        <Text style={S.totalLbl}>Total Items</Text>
        <Text style={S.totalQty}>{items.length}</Text>
      </View>

      {sizeRows.length > 0 && (
        <>
          <View style={S.horzDiv} />
          <Text style={S.secLabel}>By Size Class</Text>
          <View style={S.sizeGrid}>
            {sizeRows.map(({ label, count }) => (
              <View key={label} style={S.sizePill}>
                <Text style={S.sizeCnt}>{count}</Text>
                <Text style={S.sizeLbl}>{label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={S.footer} fixed>
        {companyName} · Movers Item List · {date}
      </Text>
    </Page>
  );
}

// ─── Detail pages: 2 items per explicit Page (no wrap/overflow bugs) ──────────
function DetailPages({ items, settings }: { items: ItemSlim[]; settings: MoversPDFProps["settings"] }) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pairs = chunk(items, 2);
  const total = items.length;

  return (
    <>
      {pairs.map((pair, pageIdx) => (
        <Page key={pageIdx} size="LETTER" style={S.page}>
          <PageHeader
            companyName={companyName}
            logoUrl={logoUrl}
            label={`Page ${pageIdx + 1} of ${pairs.length}`}
          />

          {pair.map((item, slotIdx) => {
            const globalNum = pageIdx * 2 + slotIdx + 1;
            return (
              <React.Fragment key={item.id}>
                {slotIdx > 0 && <View style={S.divider} />}
                <ItemBlock item={item} number={globalNum} total={total} />
              </React.Fragment>
            );
          })}

          <Text style={S.footer} fixed>
            {companyName} · Movers Item List · {date}
          </Text>
        </Page>
      ))}
    </>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────
export function MoversPDF(props: MoversPDFProps) {
  return (
    <Document title="Movers Item List">
      <SummaryPage {...props} />
      <DetailPages items={props.items} settings={props.settings} />
    </Document>
  );
}

export async function renderMoversPDF(props: MoversPDFProps): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<MoversPDF {...props} />) as Promise<Buffer>;
}
