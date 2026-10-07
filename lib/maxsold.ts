// MaxSold catalog export — builds the lots CSV and image file names per
// MaxSold's "CSV Importer – Delivery Guide" (image folder mode, Option A):
//   • one CSV row per lot, with Lot Number / Title / Description
//   • lot numbers are plain positive integers, unique within the file
//   • images named `<lot>-<n>.<ext>` (n starts at 1, numeric order = photo order)
//   • at most 20 images per lot by default (extras are skipped by MaxSold)
// Client-safe: no server imports.
import type { Item } from "./types";

export const MAXSOLD_MAX_IMAGES_PER_LOT = 20;
const SUPPORTED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"]);

export type LotNumbering = "sequential" | "barcode";

export interface MaxsoldLot {
  lotNumber: number;
  item: Item;
  title: string;
  description: string;
  /** Source image URLs, in photo order, capped at MAXSOLD_MAX_IMAGES_PER_LOT. */
  imageUrls: string[];
  /** Photos beyond the per-lot cap that won't be exported. */
  skippedImages: number;
}

export interface MaxsoldPlan {
  lots: MaxsoldLot[];
  /** Items that can't be exported with the chosen numbering (barcode mode only). */
  excluded: { item: Item; reason: string }[];
}

function itemImageUrls(item: Item): string[] {
  const urls = (item.photos ?? []).map(p => p.url).filter(Boolean);
  if (urls.length === 0 && item.photoUrl) urls.push(item.photoUrl);
  return urls.filter(u => u.startsWith("https://"));
}

/** Description text: the listing description, plus condition and dimensions
 * (MaxSold doesn't import those as fields, so they ride along in the text). */
export function buildMaxsoldDescription(item: Item): string {
  const parts: string[] = [];
  const body = (item.listingDescriptionEbay || "").trim();
  parts.push(body || item.itemName || "");

  const condition = [item.condition, item.conditionNotes?.trim()].filter(Boolean).join(" — ");
  if (condition) parts.push(`Condition: ${condition}`);

  const dims = [
    item.widthInches != null ? `W ${item.widthInches}"` : "",
    item.heightInches != null ? `H ${item.heightInches}"` : "",
    item.depthInches != null ? `D ${item.depthInches}"` : "",
  ].filter(Boolean).join(" × ");
  if (dims) parts.push(`Dimensions: ${dims}`);

  if ((item.quantity ?? 1) > 1) parts.push(`Quantity: ${item.quantity}`);
  return parts.filter(Boolean).join("\n\n");
}

export function planMaxsoldExport(items: Item[], numbering: LotNumbering, startAt = 1): MaxsoldPlan {
  const lots: MaxsoldLot[] = [];
  const excluded: MaxsoldPlan["excluded"] = [];
  const used = new Set<number>();
  let next = Math.max(1, Math.floor(startAt) || 1);

  for (const item of items) {
    let lotNumber: number;
    if (numbering === "barcode") {
      const raw = (item.barcodeNumber ?? "").trim();
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
        excluded.push({ item, reason: "No item # assigned" });
        continue;
      }
      lotNumber = Number(raw);
      if (used.has(lotNumber)) {
        excluded.push({ item, reason: `Duplicate item #${raw}` });
        continue;
      }
    } else {
      lotNumber = next++;
    }
    used.add(lotNumber);

    const allImages = itemImageUrls(item);
    lots.push({
      lotNumber,
      item,
      title: (item.itemName || item.listingTitleEbay || "Untitled item").trim(),
      description: buildMaxsoldDescription(item),
      imageUrls: allImages.slice(0, MAXSOLD_MAX_IMAGES_PER_LOT),
      skippedImages: Math.max(0, allImages.length - MAXSOLD_MAX_IMAGES_PER_LOT),
    });
  }
  return { lots, excluded };
}

function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Lot Number / Title / Description are what MaxSold imports; the extra
 * columns are ignored by their importer but help reconcile back to Rightsize. */
export function buildMaxsoldCsv(lots: MaxsoldLot[]): string {
  const header = ["Lot Number", "Title", "Description", "Rightsize Item #", "Category", "Condition", "Estimated Value", "Image Count"];
  const rows = lots.map(l => [
    l.lotNumber,
    l.title,
    l.description,
    l.item.barcodeNumber ?? "",
    l.item.category ?? "",
    l.item.condition ?? "",
    l.item.valueMid ? l.item.valueMid.toFixed(2) : "",
    l.imageUrls.length,
  ].map(csvCell).join(","));
  // BOM so Excel opens accented characters correctly; MaxSold's importer
  // handles it like any UTF-8 CSV.
  return "﻿" + [header.join(","), ...rows].join("\r\n");
}

/** File extension for an image URL, plus a Cloudinary URL that converts
 * unsupported formats (e.g. TIFF) to full-quality JPG. */
export function maxsoldImageSource(url: string): { url: string; ext: string } {
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (SUPPORTED_EXTS.has(ext)) return { url, ext: ext === "jpeg" ? "jpg" : ext };
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return { url: url.replace("/upload/", "/upload/f_jpg,q_100/"), ext: "jpg" };
  }
  return { url, ext: "jpg" };
}

/** `<lot>-<n>.<ext>` — MaxSold's folder-mode naming, n starting at 1. */
export function maxsoldImageName(lotNumber: number, index: number, ext: string): string {
  return `${lotNumber}-${index + 1}.${ext}`;
}
