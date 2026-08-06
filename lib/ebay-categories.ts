// eBay US leaf category IDs keyed by Rightsize category name.
// Generated via /api/ebay/category-lookup (getCategorySuggestions, tree 0).
// Re-run that endpoint to refresh if eBay restructures their taxonomy.
//
// Note: eBay has hundreds of subcategories. These are the best single-leaf
// fallbacks per Rightsize category. For items that need a more specific
// category, set listingTitleEbay to a descriptive title — getCategorySuggestions
// will use it to find a better leaf for "Other" items.

export const EBAY_CATEGORY_MAP: Record<string, string> = {
  // ── Furniture ──────────────────────────────────────────────────────────────
  "Seating":                           "261259", // Antiques > Furniture > Chairs
  "Tables & Desks":                    "261585", // Antiques > Furniture > Tables
  "Cabinets, Dressers & Shelving":     "261261", // Antiques > Furniture > Dressers & Chests of Drawers
  "Beds & Bedroom":                    "261255", // Antiques > Furniture > Bedroom Sets
  "Mirrors":                           "261264", // Antiques > Furniture > Mirrors

  // ── Art ────────────────────────────────────────────────────────────────────
  "Fine Art & Paintings":              "551",    // Art > Paintings
  "Prints & Framed Art":               "360",    // Art > Art Prints
  "Sculpture & Figurines":             "553",    // Art > Art Sculptures

  // ── Home Décor ─────────────────────────────────────────────────────────────
  "Lamps & Lighting":                  "112581", // Home & Garden > Lamps, Lighting & Ceiling Fans > Lamps
  "Vases, Bowls & Decorative Objects": "101415", // Home & Garden > Home Décor > Vases

  // ── Rugs ───────────────────────────────────────────────────────────────────
  "Rugs & Textiles":                   "37978",  // Antiques > Rugs & Carpets

  // ── Pottery & Glass ────────────────────────────────────────────────────────
  "Fine China & Dinnerware":           "262373", // Pottery & Glass > Decorative Cookware, Dinnerware & Serveware > Dinner Sets
  "Glassware & Crystal":               "262360", // Pottery & Glass > Drinkware & Barware > Drinkware

  // ── Silver ─────────────────────────────────────────────────────────────────
  "Silver & Serveware":                "20104",  // Antiques > Silver > Sterling Silver > Flatware & Silverware

  // ── Kitchen ────────────────────────────────────────────────────────────────
  "Kitchenware & Cookware":            "975",    // Collectibles > Kitchen & Home > Cookware > Other Collectible Cookware

  // ── Jewelry ────────────────────────────────────────────────────────────────
  "Jewelry & Watches":                 "262013", // Jewelry & Watches > Vintage & Antique Jewelry > Necklaces & Pendants

  // ── Clothing & Accessories ─────────────────────────────────────────────────
  "Handbags & Accessories":            "169291", // Clothing, Shoes & Accessories > Women > Women's Bags & Handbags
  "Clothing & Furs":                   "175783", // Clothing > Specialty > Vintage > Women's Vintage Clothing > Coats, Jackets & Vests

  // ── Books ──────────────────────────────────────────────────────────────────
  "Books & Media":                     "29223",  // Books & Magazines > Antiquarian & Collectible

  // ── Collectibles ───────────────────────────────────────────────────────────
  "Collectibles & Memorabilia":        "50129",  // Sports Mem, Cards & Fan Shop > Vintage Sports Memorabilia > Photos
  "Toys, Games & Dolls":               "885",    // Collectibles > Banks, Registers & Vending > Mechanical Banks
  "Holiday & Seasonal":                "77988",  // Collectibles > Holiday & Seasonal > Ornaments

  // ── Instruments / Electronics / Tools ──────────────────────────────────────
  "Musical Instruments":               "16224",  // Musical Instruments & Gear > String > Folk & World > Ukuleles
  "Electronics":                       "38034",  // Collectibles > Radio, Phonograph, TV, Phone > Radios > Tube Radios > 1930-49
  "Tools, Outdoor & Garage":           "13874",  // Collectibles > Tools, Hardware & Locks > Tools > Carpentry, Woodworking > Planes

  // ── Catch-all ──────────────────────────────────────────────────────────────
  "Other":                             "26425",  // Collectibles > Wholesale Lots > Other Collectible Lots
};
