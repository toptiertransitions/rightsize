import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";

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
  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         "https://api.ebay.com/oauth/api_scope/sell.inventory",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json({ error: `Token error: ${text}` }, { status: 500 });
  }

  const { access_token } = await tokenRes.json();

  // Create merchant location
  const locationKey = process.env.EBAY_MERCHANT_LOCATION_KEY ?? "TTT_CHICAGO";
  const locRes = await fetch(
    `https://api.ebay.com/sell/inventory/v1/location/${locationKey}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type":  "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify({
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
      }),
    }
  );

  if (!locRes.ok && locRes.status !== 409) {
    const text = await locRes.text();
    return NextResponse.json({ error: `Location error (${locRes.status}): ${text}` }, { status: 500 });
  }

  // 409 = already exists, which is fine
  return NextResponse.json({ success: true, alreadyExisted: locRes.status === 409 });
}
