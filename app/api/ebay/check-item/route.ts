import { NextRequest, NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";

function nodeGet(url: string, token: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers:  { "Authorization": `Bearer ${token}`, "Content-Language": "en-US" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function nodePost(url: string, headers: Record<string, string>, body: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname,
        method:   "POST",
        headers:  { ...headers, "content-length": String(bodyBuf.length) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

function analyzeUrl(url: string) {
  return {
    url,
    isHttps:      url.startsWith("https://"),
    isEPS:        url.includes("ebayimg.com") || url.includes("ebaystatic.com"),
    isCloudinary: url.includes("cloudinary.com"),
    hasFAuto:     url.includes("f_auto") || url.includes("fetch_format"),
  };
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sku        = req.nextUrl.searchParams.get("sku");
  const listingId  = req.nextUrl.searchParams.get("listingId");
  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  // ── User token (Inventory API) ────────────────────────────────────────────
  let inventoryData: Record<string, unknown> | null = null;
  if (sku) {
    const refreshToken = process.env.EBAY_REFRESH_TOKEN!;
    const tokenRes = await nodePost(
      "https://api.ebay.com/identity/v1/oauth2/token",
      { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: "https://api.ebay.com/oauth/api_scope/sell.inventory" }).toString()
    );
    if (tokenRes.ok) {
      const { access_token } = JSON.parse(tokenRes.body) as { access_token: string };
      const itemRes = await nodeGet(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, access_token);
      if (itemRes.ok) inventoryData = JSON.parse(itemRes.body) as Record<string, unknown>;
    }
  }

  // ── App token (Browse API — shows what buyers/Flyp actually see) ──────────
  let browseData: Record<string, unknown> | null = null;
  if (listingId) {
    const appTokenRes = await nodePost(
      "https://api.ebay.com/identity/v1/oauth2/token",
      { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString()
    );
    if (appTokenRes.ok) {
      const { access_token } = JSON.parse(appTokenRes.body) as { access_token: string };
      const browseRes = await nodeGet(
        `https://api.ebay.com/buy/browse/v1/item/v1%7C${listingId}%7C0`,
        access_token
      );
      if (browseRes.ok) browseData = JSON.parse(browseRes.body) as Record<string, unknown>;
    }
  }

  // ── Inventory API images (what we sent) ──────────────────────────────────
  const invProduct = inventoryData?.product as { imageUrls?: string[]; title?: string } | undefined;
  const inventoryImages = (invProduct?.imageUrls ?? []).map(analyzeUrl);

  // ── Browse API images (what buyers/Flyp see) ─────────────────────────────
  interface BrowseImage { imageUrl?: string }
  const browseImage  = browseData?.image as BrowseImage | undefined;
  const browseAdditional = browseData?.additionalImages as BrowseImage[] | undefined;
  const browseImages = [
    ...(browseImage?.imageUrl ? [browseImage.imageUrl] : []),
    ...(browseAdditional ?? []).map((i: BrowseImage) => i.imageUrl ?? "").filter(Boolean),
  ].map(analyzeUrl);

  const allEPS = browseImages.length > 0 && browseImages.every(i => i.isEPS);

  return NextResponse.json({
    sku,
    listingId,
    title: invProduct?.title ?? browseData?.title,
    verdict: browseImages.length === 0
      ? "no browse data — pass ?listingId=327298327235"
      : allEPS
        ? "GOOD: eBay transloaded all images to EPS — Flyp issue is elsewhere"
        : "BAD: eBay is serving original Cloudinary URLs — transload never happened",
    inventoryApi: { imageCount: inventoryImages.length, images: inventoryImages },
    browseApi:    { imageCount: browseImages.length,    images: browseImages },
  });
}
