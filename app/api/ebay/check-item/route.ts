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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "Pass ?sku=ttt-{airtableId}" }, { status: 400 });

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await nodePost(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         "https://api.ebay.com/oauth/api_scope/sell.inventory",
    }).toString()
  );

  if (!tokenRes.ok) {
    return NextResponse.json({ error: `Token error (${tokenRes.status}): ${tokenRes.body}` }, { status: 500 });
  }

  const { access_token } = JSON.parse(tokenRes.body) as { access_token: string };
  const itemRes = await nodeGet(
    `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    access_token
  );

  if (!itemRes.ok) {
    return NextResponse.json({ error: `eBay error (${itemRes.status}): ${itemRes.body}` }, { status: itemRes.status });
  }

  const item = JSON.parse(itemRes.body) as {
    product?: { imageUrls?: string[]; title?: string };
    condition?: string;
  };

  const imageUrls = item.product?.imageUrls ?? [];
  const analysis = imageUrls.map(url => ({
    url,
    isHttps:    url.startsWith("https://"),
    isEPS:      url.includes("ebayimg.com") || url.includes("ebaystatic.com"),
    isCloudinary: url.includes("cloudinary.com"),
    hasFAuto:   url.includes("f_auto") || url.includes("fetch_format"),
  }));

  return NextResponse.json({
    sku,
    title: item.product?.title,
    condition: item.condition,
    imageCount: imageUrls.length,
    images: analysis,
  });
}
