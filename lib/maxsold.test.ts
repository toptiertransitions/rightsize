import { describe, it, expect } from "vitest";
import { planMaxsoldExport, buildMaxsoldCsv, maxsoldImageName, maxsoldImageSource, buildMaxsoldDescription, MAXSOLD_MAX_IMAGES_PER_LOT } from "./maxsold";
import type { Item } from "./types";

const photo = (n: number) => ({ url: `https://res.cloudinary.com/x/image/upload/v1/p${n}.jpg`, publicId: `p${n}` });
function item(over: Partial<Item>): Item {
  return { id: "i", itemName: "Chair", condition: "Good", conditionNotes: "", listingDescriptionEbay: "", category: "Seating", valueMid: 0, photos: [photo(1)], ...over } as Item;
}

describe("planMaxsoldExport", () => {
  it("numbers lots sequentially from the start value", () => {
    const { lots } = planMaxsoldExport([item({ id: "a" }), item({ id: "b" })], "sequential", 41);
    expect(lots.map(l => l.lotNumber)).toEqual([41, 42]);
  });

  it("uses barcodes as lot numbers and excludes missing or duplicate ones", () => {
    const { lots, excluded } = planMaxsoldExport([
      item({ id: "a", barcodeNumber: "10006236" }),
      item({ id: "b", barcodeNumber: "" }),
      item({ id: "c", barcodeNumber: "10006236" }),
      item({ id: "d", barcodeNumber: "441A" }),
    ], "barcode");
    expect(lots.map(l => l.lotNumber)).toEqual([10006236]);
    expect(excluded.map(e => e.item.id)).toEqual(["b", "c", "d"]);
  });

  it("caps images per lot and reports the rest", () => {
    const photos = Array.from({ length: 23 }, (_, i) => photo(i + 1));
    const [lot] = planMaxsoldExport([item({ photos })], "sequential").lots;
    expect(lot.imageUrls).toHaveLength(MAXSOLD_MAX_IMAGES_PER_LOT);
    expect(lot.skippedImages).toBe(3);
  });

  it("falls back to photoUrl when there is no photos array", () => {
    const [lot] = planMaxsoldExport([item({ photos: [], photoUrl: "https://x/y.png" })], "sequential").lots;
    expect(lot.imageUrls).toEqual(["https://x/y.png"]);
  });
});

describe("files and CSV", () => {
  it("names images <lot>-<n>.<ext> starting at 1", () => {
    expect(maxsoldImageName(441, 0, "jpg")).toBe("441-1.jpg");
    expect(maxsoldImageName(441, 2, "png")).toBe("441-3.png");
  });

  it("keeps supported formats and converts others to JPG via Cloudinary", () => {
    expect(maxsoldImageSource("https://res.cloudinary.com/x/image/upload/v1/a.jpeg").ext).toBe("jpg");
    expect(maxsoldImageSource("https://res.cloudinary.com/x/image/upload/v1/a.heic").ext).toBe("heic");
    const tif = maxsoldImageSource("https://res.cloudinary.com/x/image/upload/v1/a.tif");
    expect(tif).toEqual({ url: "https://res.cloudinary.com/x/image/upload/f_jpg,q_100/v1/a.tif", ext: "jpg" });
  });

  it("writes required headers first and quotes multiline/comma cells", () => {
    const { lots } = planMaxsoldExport([item({ itemName: 'Table, oak', listingDescriptionEbay: 'Solid "oak"\\nGreat', conditionNotes: "scuff" })], "sequential");
    const csv = buildMaxsoldCsv(lots).replace(/^﻿/, "");
    const [header] = csv.split("\r\n");
    expect(header.startsWith("Lot Number,Title,Description,")).toBe(true);
    expect(csv).toContain('1,"Table, oak","Solid ""oak""');
  });

  it("puts condition and dimensions into the description", () => {
    const d = buildMaxsoldDescription(item({ listingDescriptionEbay: "Walnut", conditionNotes: "light wear", widthInches: 30, heightInches: 18 }));
    expect(d).toBe('Walnut\n\nCondition: Good — light wear\n\nDimensions: W 30" × H 18"');
  });
});
