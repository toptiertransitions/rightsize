import React from "react";
import { Document, Page, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";

export interface LabelItem {
  id: string;
  itemName: string;
  price: number;
  barcodeNumber?: string;
}

interface Props {
  items: LabelItem[];
  widthIn: number;
  heightIn: number;
}

const PT = 72; // 1 inch = 72 pt

// ─── Compute all sizing from label dimensions + item name length ───────────────
function computeSizes(widthIn: number, heightIn: number, nameLen: number) {
  const H = heightIn * PT;
  const pad = 4;
  const inner = H - pad * 2; // usable height

  // Price — large, proportional, capped
  const priceSize = Math.max(12, Math.min(20, H * 0.25));
  const priceH = priceSize * 1.15 + 1;

  // Barcode number — tiny fixed at bottom
  const codeSize = Math.max(4, Math.min(6, H * 0.075));
  const codeH = codeSize + 3;

  // Name — shrinks based on character count so it always fits in 1–2 lines
  const baseNameSize = Math.max(5, Math.min(8, H * 0.105));
  const scaleFactor = nameLen > 90 ? 0.65 : nameLen > 65 ? 0.78 : nameLen > 45 ? 0.88 : 1;
  const nameSize = Math.max(4, Math.round(baseNameSize * scaleFactor * 10) / 10);
  const nameH = nameSize * 1.35 * 2 + 1; // reserve 2 lines

  // Barcode image — whatever remains
  const barcodeH = Math.max(14, inner - priceH - nameH - codeH - 3);

  return { priceSize, priceH, nameSize, nameH, codeSize, codeH, barcodeH, pad };
}

// ─── Single label page ─────────────────────────────────────────────────────────
function LabelPage({
  item,
  barcodeDataUrl,
  widthIn,
  heightIn,
}: {
  item: LabelItem;
  barcodeDataUrl: string | null;
  widthIn: number;
  heightIn: number;
}) {
  const W = widthIn * PT;
  const H = heightIn * PT;
  const s = computeSizes(widthIn, heightIn, item.itemName.length);

  const priceStr = item.price > 0
    ? `$${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";

  return (
    <Page
      size={[W, H]}
      style={{
        width: W,
        height: H,
        padding: s.pad,
        flexDirection: "column",
        backgroundColor: "#ffffff",
        fontFamily: "Helvetica",
        overflow: "hidden",
      }}
    >
      {/* Price */}
      {priceStr ? (
        <Text
          style={{
            fontSize: s.priceSize,
            fontFamily: "Helvetica-Bold",
            color: "#000000",
            letterSpacing: -0.3,
            marginBottom: 1,
          }}
        >
          {priceStr}
        </Text>
      ) : null}

      {/* Item name */}
      <Text
        style={{
          fontSize: s.nameSize,
          fontFamily: "Helvetica",
          color: "#444444",
          lineHeight: 1.3,
          marginBottom: 2,
          maxLines: 2,
        }}
      >
        {item.itemName}
      </Text>

      {/* Barcode image — fills remaining space */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", marginBottom: 1 }}>
        {barcodeDataUrl ? (
          <Image
            src={barcodeDataUrl}
            style={{
              width: W - s.pad * 2,
              height: s.barcodeH,
              objectFit: "contain",
            }}
          />
        ) : (
          <Text style={{ fontSize: s.codeSize, color: "#cccccc" }}>—</Text>
        )}
      </View>

      {/* Barcode number */}
      {item.barcodeNumber ? (
        <Text
          style={{
            fontSize: s.codeSize,
            fontFamily: "Helvetica",
            color: "#666666",
            textAlign: "center",
            letterSpacing: 0.6,
          }}
        >
          {item.barcodeNumber}
        </Text>
      ) : null}
    </Page>
  );
}

function LabelDocument({
  items,
  barcodePngs,
  widthIn,
  heightIn,
}: {
  items: LabelItem[];
  barcodePngs: (string | null)[];
  widthIn: number;
  heightIn: number;
}) {
  return (
    <Document>
      {items.map((item, i) => (
        <LabelPage
          key={item.id}
          item={item}
          barcodeDataUrl={barcodePngs[i]}
          widthIn={widthIn}
          heightIn={heightIn}
        />
      ))}
    </Document>
  );
}

export async function renderLabelPDF({ items, widthIn, heightIn }: Props): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bwipjs = require("bwip-js") as {
    toBuffer: (opts: Record<string, unknown>) => Promise<Buffer>;
  };

  const barcodePngs: (string | null)[] = await Promise.all(
    items.map(async (item) => {
      const code = item.barcodeNumber?.trim();
      if (!code) return null;
      try {
        const png: Buffer = await bwipjs.toBuffer({
          bcid: "code128",
          text: code,
          scale: 4,
          height: 8,       // bar height in mm — enough for scanning
          includetext: false,
          padding: 0,
          backgroundcolor: "ffffff",
        });
        return `data:image/png;base64,${png.toString("base64")}`;
      } catch {
        return null;
      }
    })
  );

  const buffer = await renderToBuffer(
    <LabelDocument
      items={items}
      barcodePngs={barcodePngs}
      widthIn={widthIn}
      heightIn={heightIn}
    />
  );

  return Buffer.from(buffer);
}
