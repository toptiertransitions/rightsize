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

  // ─── Summary page ────────────────────────────────────────────────────────────
  summaryTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
    marginTop: 4,
  },
  summaryDate: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottom: "1.5pt solid #d1d5db",
    marginBottom: 1,
  },
  tableHeaderItem: {
    flex: 1,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableHeaderQty: {
    width: 36,
    textAlign: "right",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottom: "0.5pt solid #f3f4f6",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottom: "0.5pt solid #f3f4f6",
    backgroundColor: "#f9fafb",
  },
  tableItemName: {
    flex: 1,
    fontSize: 11,
    color: "#111827",
  },
  tableQty: {
    width: 36,
    textAlign: "right",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderTop: "1.5pt solid #374151",
    marginTop: 1,
  },
  totalLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  totalQty: {
    width: 36,
    textAlign: "right",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  divider: {
    borderBottom: "1pt solid #e5e7eb",
    marginVertical: 20,
  },
  sizeGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  sizePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  sizePillCount: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  sizePillLabel: {
    fontSize: 9,
    color: "#6b7280",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

interface MoversPDFProps {
  items: Pick<Item, "id" | "itemName" | "photoUrl" | "category" | "condition" | "sizeClass">[];
  settings: Pick<InvoiceSettings, "logoUrl" | "companyName"> | null;
  aiGroups?: MoverGroup[];
}

// ─── Summary page helpers ──────────────────────────────────────────────────────
function buildItemCounts(
  items: MoversPDFProps["items"]
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = (item.itemName || "Unnamed Item").trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count; // high count first
      return a.name.localeCompare(b.name);               // then A-Z
    });
}

function buildSizeCounts(
  items: MoversPDFProps["items"]
): { label: string; count: number }[] {
  const ORDER = ["Needs Movers", "Fits in Car-SUV", "Small & Shippable"];
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.sizeClass || "Unspecified";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const known = ORDER.filter(k => map.has(k)).map(k => ({ label: k, count: map.get(k)! }));
  const other = [...map.entries()]
    .filter(([k]) => !ORDER.includes(k))
    .map(([label, count]) => ({ label, count }));
  return [...known, ...other];
}

// ─── Summary first page ───────────────────────────────────────────────────────
function SummaryPage({ items, settings, aiGroups }: MoversPDFProps) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;
  const date = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  // Prefer AI-grouped categories; fall back to exact-name counts
  const useAI = aiGroups && aiGroups.length > 0;
  const itemRows: { name: string; count: number }[] = useAI
    ? aiGroups.map(g => ({ name: g.category, count: g.count }))
    : buildItemCounts(items);
  const sizeRows = buildSizeCounts(items);

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.pageInner}>
        {/* Header — same as item pages */}
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
            <Text style={styles.headerDoc}>Summary</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.summaryTitle}>Moving Summary</Text>
        <Text style={styles.summaryDate}>Generated {date} · {items.length} item{items.length !== 1 ? "s" : ""} total</Text>

        {/* Item count table */}
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

        {/* Size breakdown */}
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

        {/* Footer */}
        <Text style={styles.pageNum} fixed>
          {companyName} · Movers Item List
        </Text>
      </View>
    </Page>
  );
}

// ─── Main PDF document ────────────────────────────────────────────────────────
export function MoversPDF({ items, settings, aiGroups }: MoversPDFProps) {
  const companyName = settings?.companyName || "Top Tier Transitions";
  const logoUrl = settings?.logoUrl || null;

  return (
    <Document title="Movers Item List">
      {/* Page 1: Summary */}
      <SummaryPage items={items} settings={settings} aiGroups={aiGroups} />

      {/* Remaining pages: one per item */}
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
