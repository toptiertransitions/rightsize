import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

function nodeGet(url: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers:  { "Authorization": `Bearer ${token}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch { resolve(null); }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function nodePost(url: string, basicCreds: string, body: string): Promise<{ access_token: string }> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname,
        method:   "POST",
        headers:  {
          "Authorization":  `Basic ${basicCreds}`,
          "Content-Type":   "application/x-www-form-urlencoded",
          "content-length": String(bodyBuf.length),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

const QUERIES: Record<string, string> = {
  "Seating":                           "antique wooden armchair vintage chair",
  "Tables & Desks":                    "antique vintage dining table",
  "Cabinets, Dressers & Shelving":     "antique dresser cabinet chest of drawers",
  "Beds & Bedroom":                    "antique vintage bed frame headboard",
  "Fine Art & Paintings":              "original oil painting artwork canvas",
  "Prints & Framed Art":               "vintage art print framed lithograph",
  "Sculpture & Figurines":             "bronze sculpture figurine statue",
  "Mirrors":                           "antique vintage decorative wall mirror",
  "Lamps & Lighting":                  "vintage table lamp floor lamp",
  "Rugs & Textiles":                   "persian oriental area rug",
  "Vases, Bowls & Decorative Objects": "decorative ceramic vase bowl porcelain",
  "Fine China & Dinnerware":           "fine china dinnerware set porcelain",
  "Glassware & Crystal":               "crystal glassware stemware vintage",
  "Silver & Serveware":                "sterling silver serving set flatware",
  "Kitchenware & Cookware":            "cast iron cookware vintage kitchen",
  "Jewelry & Watches":                 "vintage gold necklace jewelry",
  "Handbags & Accessories":            "vintage leather handbag purse",
  "Clothing & Furs":                   "vintage fur coat mink stole",
  "Books & Media":                     "antique book vintage collectible",
  "Collectibles & Memorabilia":        "antique sports memorabilia vintage signed photograph",
  "Toys, Games & Dolls":               "vintage antique cast iron mechanical bank tin toy",
  "Musical Instruments":               "vintage acoustic guitar banjo ukulele folk instrument",
  "Electronics":                       "vintage tube radio AM FM tabletop antique",
  "Tools, Outdoor & Garage":           "vintage Stanley hand plane woodworking antique tool",
  "Holiday & Seasonal":                "vintage christmas ornaments holiday decor",
  "Other":                             "antique vintage collectible miscellaneous",
};

export async function GET() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenData = await nodePost(
    "https://api.ebay.com/identity/v1/oauth2/token",
    creds,
    new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString()
  );
  const token = tokenData.access_token;

  const results: Record<string, { categoryId: string; categoryName: string; ancestors: string } | { error: string }> = {};

  for (const [category, query] of Object.entries(QUERIES)) {
    const q = encodeURIComponent(query);
    const data = await nodeGet(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${q}`,
      token
    ) as { categorySuggestions?: { category: { categoryId: string; categoryName: string }; categoryTreeNodeAncestors?: { categoryName: string }[] }[] } | null;

    const top = data?.categorySuggestions?.[0];
    if (!top) {
      results[category] = { error: "no suggestion" };
    } else {
      const ancestors = (top.categoryTreeNodeAncestors ?? [])
        .map(a => a.categoryName)
        .reverse()
        .join(" > ");
      results[category] = {
        categoryId:   top.category.categoryId,
        categoryName: top.category.categoryName,
        ancestors,
      };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
