import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";

function nodePost(url: string, headers: Record<string, string>, body: string) {
  return new Promise<{ ok: boolean; status: number; text(): Promise<string> }>((resolve, reject) => {
    const parsed  = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "POST",
        headers:  { ...headers, "content-length": String(bodyBuf.length) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw    = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(raw) });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN!;

  // Get access token
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
    const text = await tokenRes.text();
    return NextResponse.json({ error: `Token error: ${text}` }, { status: 500 });
  }

  const tokenData = JSON.parse(await tokenRes.text()) as { access_token: string };
  const access_token = tokenData.access_token;

  // Create merchant location
  const locationKey = process.env.EBAY_MERCHANT_LOCATION_KEY ?? "TTT_CHICAGO";
  const locBody = JSON.stringify({
    location: {
      address: {
        city:            "Chicago",
        stateOrProvince: "IL",
        postalCode:      "60601",
        country:         "US",
      },
    },
    locationTypes:          ["WAREHOUSE"],
    name:                   "Top Tier Transitions Chicago",
    merchantLocationStatus: "ENABLED",
  });

  const locRes = await new Promise<{ ok: boolean; status: number; text(): Promise<string> }>((resolve, reject) => {
    const parsed  = new URL(`https://api.ebay.com/sell/inventory/v1/location/${locationKey}`);
    const bodyBuf = Buffer.from(locBody, "utf8");
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname,
        method:   "POST",
        headers:  {
          "Authorization":   `Bearer ${access_token}`,
          "Content-Type":    "application/json",
          "Accept-Language": "en-US",
          "content-length":  String(bodyBuf.length),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw    = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(raw) });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });

  if (!locRes.ok && locRes.status !== 409) {
    const text = await locRes.text();
    return NextResponse.json({ error: `Location error (${locRes.status}): ${text}` }, { status: 500 });
  }

  // 409 = already exists, which is fine
  return NextResponse.json({ success: true, alreadyExisted: locRes.status === 409 });
}
