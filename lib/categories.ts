// Single source of truth for item category taxonomy.
// Import from here — never hard-code category lists elsewhere.

export const CATEGORY_GROUPS = [
  {
    group: "Furniture",
    categories: [
      "Seating",
      "Tables & Desks",
      "Cabinets, Dressers & Shelving",
      "Beds & Bedroom",
    ],
  },
  {
    group: "Art & Wall",
    categories: [
      "Fine Art & Paintings",
      "Prints & Framed Art",
      "Sculpture & Figurines",
      "Mirrors",
    ],
  },
  {
    group: "Home Décor",
    categories: [
      "Lamps & Lighting",
      "Rugs & Textiles",
      "Vases, Bowls & Decorative Objects",
    ],
  },
  {
    group: "Tabletop & Kitchen",
    categories: [
      "Fine China & Dinnerware",
      "Glassware & Crystal",
      "Silver & Serveware",
      "Kitchenware & Cookware",
    ],
  },
  {
    group: "Personal",
    categories: [
      "Jewelry & Watches",
      "Handbags & Accessories",
      "Clothing & Furs",
    ],
  },
  {
    group: "Media, Collectibles & Specialty",
    categories: [
      "Books & Media",
      "Collectibles & Memorabilia",
      "Toys, Games & Dolls",
      "Musical Instruments",
      "Electronics",
      "Tools, Outdoor & Garage",
      "Holiday & Seasonal",
      "Other",
    ],
  },
] as const;

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]["group"];
export type ItemCategory = (typeof CATEGORY_GROUPS)[number]["categories"][number];

export const ALL_CATEGORIES: string[] = CATEGORY_GROUPS.flatMap(g => [...g.categories]);

export function isValidCategory(cat: string): cat is ItemCategory {
  return ALL_CATEGORIES.includes(cat);
}

export function categoryToGroup(cat: string): string {
  return CATEGORY_GROUPS.find(g => (g.categories as readonly string[]).includes(cat))?.group ?? "Other";
}

// Keyword rules for migration — first match wins (top to bottom).
// Each entry: [regex, target category]
export const CATEGORY_KEYWORD_RULES: [RegExp, string][] = [
  [/sofa|couch|loveseat|recliner|armchair|\bchair\b|bar stool|\bstool\b|\bbench\b|settee|ottoman/i, "Seating"],
  [/\btable\b|\bdesk\b|console|nightstand|\bvanity\b/i, "Tables & Desks"],
  [/dresser|cabinet|hutch|\bshelf\b|\bshelves\b|bookcase|armoire|credenza|\bchest\b|buffet|sideboard|curio|wardrobe/i, "Cabinets, Dressers & Shelving"],
  [/\bbed\b|headboard|mattress/i, "Beds & Bedroom"],
  [/painting|oil on|watercolor|\bcanvas\b|original art|\bart\b|artwork/i, "Fine Art & Paintings"],
  [/\bprint\b|\bposter\b|lithograph|giclee|framed/i, "Prints & Framed Art"],
  [/sculpture|figurine|\bstatue\b|\bbust\b|\bbronze\b|carving|\bfigure\b/i, "Sculpture & Figurines"],
  [/\bmirror\b/i, "Mirrors"],
  [/\blamp\b|chandelier|sconce|lantern|lighting/i, "Lamps & Lighting"],
  [/\brug\b|carpet|tapestry|quilt|\bpillow\b|curtain|\bdrape\b|linen/i, "Rugs & Textiles"],
  [/\bvase\b|\burn\b|\bbowl\b|candle|candelabra|\bclock\b|bookend|planter|pottery|ceramic|stoneware|\bdecor\b|ornament/i, "Vases, Bowls & Decorative Objects"],
  [/\bchina\b|dinnerware|\bplate\b|\bplatter\b|tureen|porcelain|dish set/i, "Fine China & Dinnerware"],
  [/\bglass\b|crystal|stemware|goblet|tumbler|\bcoupe\b|decanter|barware/i, "Glassware & Crystal"],
  [/\bsilver\b|sterling|flatware|samovar|\btray\b|serveware/i, "Silver & Serveware"],
  [/cookware|corning|pyrex|casserole|\bpot\b|\bpan\b|bakeware|cast iron|blender|\bmixer\b|toaster|\bcrock\b/i, "Kitchenware & Cookware"],
  [/jewelry|necklace|bracelet|earring|\bring\b|brooch|pendant|\bwatch\b|pearls/i, "Jewelry & Watches"],
  [/purse|handbag|wallet|\bscarf\b|\bbelt\b|\bhat\b|clutch|\btote\b/i, "Handbags & Accessories"],
  [/\bcoat\b|jacket|\bdress\b|\bsuit\b|\bfur\b|mink|sweater|\bgown\b|blouse|clothing/i, "Clothing & Furs"],
  [/\bbook\b|volume|encyclopedia|\bvinyl\b|\brecord\b|\balbum\b|\bdvd\b/i, "Books & Media"],
  [/\btoy\b|\bgame\b|puzzle|\bdoll\b|train set|lego/i, "Toys, Games & Dolls"],
  [/piano|guitar|violin|organ|flute|instrument/i, "Musical Instruments"],
  [/\btv\b|television|stereo|speaker|\bradio\b|computer|laptop|camera|printer/i, "Electronics"],
  [/\btool\b|drill|\bsaw\b|ladder|patio|outdoor|\bgarden\b|\bgrill\b|lawn/i, "Tools, Outdoor & Garage"],
  [/christmas|holiday|halloween|easter|nativity|seasonal/i, "Holiday & Seasonal"],
  [/\bcoin\b|\bstamp\b|militaria|memorabilia|collectible/i, "Collectibles & Memorabilia"],
];

export function migrateCategoryByKeyword(itemName: string): string {
  for (const [re, cat] of CATEGORY_KEYWORD_RULES) {
    if (re.test(itemName)) return cat;
  }
  return "Other";
}

// Old → new category mapping for direct value migration.
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "Art & Collectibles": "Fine Art & Paintings",
  "Clothing & Accessories": "Clothing & Furs",
  "Décor & Accessories": "Vases, Bowls & Decorative Objects",
  "Kitchen & Dining": "Kitchenware & Cookware",
  "Sports & Outdoors": "Tools, Outdoor & Garage",
  "Toys and Games": "Toys, Games & Dolls",
  "Toys & Games": "Toys, Games & Dolls",
  "Houseware": "Kitchenware & Cookware",
  "Antiques": "Other",
  "Appliances": "Kitchenware & Cookware",
  "Jewelry": "Jewelry & Watches",
  "Sporting Goods": "Tools, Outdoor & Garage",
  "Tools & Hardware": "Tools, Outdoor & Garage",
  "Bedroom": "Beds & Bedroom",
  "Bathroom": "Vases, Bowls & Decorative Objects",
  "Office": "Tables & Desks",
  "Outdoor & Garden": "Tools, Outdoor & Garage",
  "Christmas": "Holiday & Seasonal",
};

// AI hint text embedded in the prompt so the model picks correctly.
export const CATEGORY_AI_HINT = `
CATEGORY must be EXACTLY one of these 26 values (copy verbatim):

Furniture group: Seating | Tables & Desks | Cabinets, Dressers & Shelving | Beds & Bedroom
Art & Wall group: Fine Art & Paintings | Prints & Framed Art | Sculpture & Figurines | Mirrors
Home Décor group: Lamps & Lighting | Rugs & Textiles | Vases, Bowls & Decorative Objects
Tabletop & Kitchen group: Fine China & Dinnerware | Glassware & Crystal | Silver & Serveware | Kitchenware & Cookware
Personal group: Jewelry & Watches | Handbags & Accessories | Clothing & Furs
Media, Collectibles & Specialty group: Books & Media | Collectibles & Memorabilia | Toys, Games & Dolls | Musical Instruments | Electronics | Tools, Outdoor & Garage | Holiday & Seasonal | Other

Picking guidance:
- Original paintings, oils, watercolors, canvases → Fine Art & Paintings
- Framed prints, posters, lithographs, giclées → Prints & Framed Art
- Figurines, statues, bronzes, sculptures → Sculpture & Figurines
- Cookware, bakeware, small appliances, kitchen gadgets → Kitchenware & Cookware
- Fine china, plates, serving sets, porcelain dinnerware → Fine China & Dinnerware
- Stemware, crystal, barware, decanters → Glassware & Crystal
- Sterling silver, silverplate, flatware, trays → Silver & Serveware
- Pottery, ceramics, vases, decorative bowls, clocks → Vases, Bowls & Decorative Objects
- Antique/vintage is an ATTRIBUTE, not a category — pick the correct category above regardless of age
`.trim();
