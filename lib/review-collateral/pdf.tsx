import path from "path";
import { readFileSync } from "fs";
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";

// Branded "Five-Star Client Story" one-pager, made from a 5-star Google
// review. Same design as the review PDFs already in the Content repository
// (cream page, thin gold border, centered TopTier logo, gold stars, Lora
// italic quote, Poppins name, membership badges). Measurements are taken
// from those PDFs (US Letter, points). Fonts and images are bundled in
// ./assets (see outputFileTracingIncludes in next.config.ts).

const ASSETS = path.join(process.cwd(), "lib/review-collateral/assets");
const asset = (name: string) => path.join(ASSETS, name);

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({ family: "Lora", fonts: [{ src: asset("Lora-Regular.ttf") }, { src: asset("Lora-Italic.ttf"), fontStyle: "italic" }] });
  Font.register({
    family: "Poppins",
    fonts: [
      { src: asset("Poppins-Regular.ttf") },
      { src: asset("Poppins-Medium.ttf"), fontWeight: 500 },
      { src: asset("Poppins-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Keep words whole, like the originals
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const png = (name: string) => ({ data: readFileSync(asset(name)), format: "png" as const });

const C = {
  page: "#f6f2e9",
  gold: "#c9a96e",
  forest: "#004935",
  sage: "#6e7c5c",
  quoteMark: "#b7c2a6",
  ink: "#2b2b2b",
  rule: "#ddd3bc",
};

const s = StyleSheet.create({
  page: { backgroundColor: C.page, fontFamily: "Lora" },
  border: { position: "absolute", top: 36.4, left: 36.4, width: 539.2, height: 719.2, borderWidth: 1, borderColor: C.gold },
  logo: { position: "absolute", top: 81, left: 194.2, width: 223.5, height: 67 },
  tagline: { position: "absolute", top: 159.5, left: 0, right: 0, textAlign: "center", fontStyle: "italic", fontSize: 9, letterSpacing: 1, color: C.sage },
  dividerLine: { position: "absolute", top: 196.1, width: 82.5, height: 0.75, backgroundColor: C.gold },
  diamond: { position: "absolute", top: 194.2, left: 304.3, width: 4.5, height: 4.5, backgroundColor: C.gold, transform: "rotate(45deg)" },
  middle: { position: "absolute", top: 205, height: 415, left: 90, right: 90, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Poppins", fontWeight: 500, fontSize: 9, letterSpacing: 3.3, color: C.forest },
  stars: { flexDirection: "row", marginTop: 18, gap: 7.5 },
  quoteMark: { fontSize: 57, lineHeight: 1, color: C.quoteMark, marginTop: 6, marginBottom: -14 },
  quote: { fontStyle: "italic", color: C.ink, textAlign: "center" },
  name: { fontFamily: "Poppins", fontWeight: 700, fontSize: 10.5, letterSpacing: 2.6, color: C.forest, marginTop: 26 },
  subtitle: { fontStyle: "italic", fontSize: 9.75, color: C.sage, marginTop: 9 },
  footRule: { position: "absolute", top: 620.2, left: 129.8, width: 352.5, height: 0.75, backgroundColor: C.rule },
  footer: { position: "absolute", top: 704, left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footText: { fontFamily: "Poppins", fontSize: 7.87, letterSpacing: 0.85, color: C.forest },
  footDiamond: { width: 3.6, height: 3.6, backgroundColor: C.gold, transform: "rotate(45deg)", marginHorizontal: 10 },
});

// 5-point star, filled
function Star({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 1.8l3.05 6.9 7.45.68-5.64 4.94 1.68 7.32L12 17.77l-6.54 3.87 1.68-7.32L1.5 9.38l7.45-.68z" fill={C.gold} />
    </Svg>
  );
}

const QUOTE_WIDTH = 408; // pt, as in the originals
const QUOTE_MAX_HEIGHT = 215;
const LINE_HEIGHT = 1.67;
const LONG_LINE_HEIGHT = 1.5;
const PARA_GAP = 0.55; // em
const AVG_CHAR_EM = 0.47; // Lora Italic, measured, plus a small margin

function quoteHeight(paragraphs: string[], fs: number, lineHeight: number): number {
  const perLine = Math.floor(QUOTE_WIDTH / (fs * AVG_CHAR_EM));
  const lines = paragraphs.reduce((n, p) => n + wrapCount(p, perLine), 0);
  return lines * fs * lineHeight + (paragraphs.length - 1) * fs * PARA_GAP;
}

/**
 * Largest quote size that fits the page: 16.5pt like the short originals,
 * down to 9.5pt at the originals' line spacing; very long reviews then get
 * tighter spacing and down to 8.5pt so they still fit on one page.
 */
export function quoteLayout(paragraphs: string[]): { fontSize: number; lineHeight: number } {
  for (let fs = 16.5; fs >= 9.5; fs -= 0.25) {
    if (quoteHeight(paragraphs, fs, LINE_HEIGHT) <= QUOTE_MAX_HEIGHT) return { fontSize: fs, lineHeight: LINE_HEIGHT };
  }
  for (let fs = 10; fs > 8.5; fs -= 0.25) {
    if (quoteHeight(paragraphs, fs, LONG_LINE_HEIGHT) <= QUOTE_MAX_HEIGHT + 20) return { fontSize: fs, lineHeight: LONG_LINE_HEIGHT };
  }
  return { fontSize: 8.5, lineHeight: LONG_LINE_HEIGHT };
}

export const quoteFontSize = (paragraphs: string[]) => quoteLayout(paragraphs).fontSize;

function wrapCount(text: string, perLine: number): number {
  let lines = 1;
  let len = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (len === 0) len = w.length;
    else if (len + 1 + w.length <= perLine) len += 1 + w.length;
    else { lines++; len = w.length; }
  }
  return lines;
}

export interface ReviewCollateral {
  /** Verbatim review text */
  text: string;
  stars: number;
  /** "Jim K." */
  displayName: string;
  /** "Relocation Client" */
  clientType?: string;
  /** "Oak Park, Illinois" */
  town?: string;
}

/** Splits the verbatim review into paragraphs and adds curly quotes around the whole of it. */
export function quoteParagraphs(text: string): string[] {
  const paras = text.trim().split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return [];
  const startsQuoted = /^["“]/.test(paras[0]);
  const endsQuoted = /["”]$/.test(paras[paras.length - 1]);
  if (!startsQuoted) paras[0] = `“${paras[0]}`;
  if (!endsQuoted) paras[paras.length - 1] = `${paras[paras.length - 1]}”`;
  return paras;
}

const STAR_WORD = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE"];

function ReviewDocument({ review }: { review: ReviewCollateral }) {
  const paras = quoteParagraphs(review.text);
  const { fontSize: fs, lineHeight } = quoteLayout(paras);
  const stars = Math.max(1, Math.min(5, Math.round(review.stars)));
  const subtitle = [review.clientType?.trim(), review.town?.trim()].filter(Boolean).join(" · ");

  return (
    <Document title={`Top Tier Transitions - ${STAR_WORD[stars]} Star Review - ${review.displayName}`} author="Top Tier Transitions">
      <Page size="LETTER" style={s.page}>
        <View style={s.border} fixed />
        <Image src={png("logo.png")} style={s.logo} />
        <Text style={s.tagline}>Senior Move Management. Done Right.</Text>
        <View style={[s.dividerLine, { left: 211.5 }]} />
        <View style={s.diamond} />
        <View style={[s.dividerLine, { left: 318 }]} />

        <View style={s.middle}>
          <Text style={s.label}>{`A ${STAR_WORD[stars]}-STAR CLIENT STORY`}</Text>
          <View style={s.stars}>
            {Array.from({ length: stars }, (_, i) => <Star key={i} size={15} />)}
          </View>
          <Text style={s.quoteMark}>{"“"}</Text>
          <View style={{ width: QUOTE_WIDTH }}>
            {paras.map((p, i) => (
              <Text key={i} style={[s.quote, { fontSize: fs, lineHeight, marginTop: i === 0 ? 0 : fs * PARA_GAP }]}>{p}</Text>
            ))}
          </View>
          <Text style={s.name}>{review.displayName.toUpperCase()}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={s.footRule} />
        <Image src={png("badge-nasmm-certified.png")} style={{ position: "absolute", left: 118.5, top: 645, width: 45, height: 44.2 }} />
        <Image src={png("badge-nasmm-member.png")} style={{ position: "absolute", left: 188.2, top: 648.7, width: 94.5, height: 36 }} />
        <Image src={png("badge-continuity-of-care.png")} style={{ position: "absolute", left: 306.7, top: 655.5, width: 85.5, height: 23.2 }} />
        <Image src={png("badge-elmhurst-chamber.png")} style={{ position: "absolute", left: 416.2, top: 654.7, width: 77.2, height: 24.7 }} />
        <View style={s.footer}>
          <Text style={s.footText}>TOPTIERTRANSITIONS.COM</Text>
          <View style={s.footDiamond} />
          <Text style={s.footText}>312-600-3016</Text>
          <View style={s.footDiamond} />
          <Text style={s.footText}>INFO@TOPTIERTRANSITIONS.COM</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReviewPdf(review: ReviewCollateral): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReviewDocument review={review} />);
}
