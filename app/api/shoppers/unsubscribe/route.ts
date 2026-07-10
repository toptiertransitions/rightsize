import crypto from "crypto";
import { Resend } from "resend";
import { updateShopper } from "@/lib/airtable";

export const runtime = "nodejs";

function htmlResponse(title: string, message: string, isError = false): Response {
  const accentColor = isError ? "#c0392b" : "#7A9E7E";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ProFoundFinds</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #FAF8F5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #2C2C2C;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      padding: 48px 40px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.07);
      text-align: center;
    }
    .logo {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 24px;
      font-weight: 700;
      color: #2d4a3e;
      letter-spacing: 0.5px;
      margin-bottom: 32px;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${accentColor}20;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 28px;
    }
    h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 600;
      color: #2C2C2C;
      margin-bottom: 12px;
    }
    p {
      font-size: 15px;
      line-height: 1.65;
      color: #555;
      margin-bottom: 12px;
    }
    a { color: ${accentColor}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .divider {
      border: none;
      border-top: 1px solid #eee;
      margin: 28px 0;
    }
    .footer-note {
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ProFoundFinds</div>
    <div class="icon">${isError ? "✕" : "✓"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <hr class="divider" />
    <p class="footer-note">
      Questions? Email us at <a href="mailto:info@profoundfinds.com">info@profoundfinds.com</a>
    </p>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: isError ? 400 : 200,
  });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const sig = searchParams.get("sig");

  if (!id || !sig) {
    return htmlResponse(
      "Invalid Link",
      "This unsubscribe link is missing required parameters. Please contact info@profoundfinds.com if you need to be removed from our list.",
      true
    );
  }

  const secret = process.env.SHOPPERS_UNSUBSCRIBE_SECRET || "pf-unsub-secret";
  const expectedSig = crypto.createHmac("sha256", secret).update(id).digest("hex");

  if (sig !== expectedSig) {
    return htmlResponse(
      "Invalid Link",
      "This unsubscribe link is invalid or has been tampered with. Please contact info@profoundfinds.com to be removed from our list.",
      true
    );
  }

  let shopperName = "Shopper";
  try {
    const updated = await updateShopper(id, { optOut: true });
    shopperName = updated.name || "Shopper";
  } catch (err) {
    console.error("[unsubscribe] updateShopper failed:", err);
    return htmlResponse(
      "Something Went Wrong",
      "We were unable to process your unsubscribe request. Please email info@profoundfinds.com directly and we will remove you immediately.",
      true
    );
  }

  // Send opt-out notification
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: `ProFoundFinds <${process.env.RESEND_FROM_EMAIL ?? "hello@profoundfinds.com"}>`,
      to: ["info@profoundfinds.com"],
      subject: `Opt-out: ${shopperName}`,
      text: `${shopperName} (Airtable ID: ${id}) has unsubscribed from ProFoundFinds email blasts via the unsubscribe link.\n\nTheir optOut field has been set to true in Airtable.`,
    });
  } catch (err) {
    // Non-fatal — shopper is already opted out
    console.error("[unsubscribe] notification email failed:", err);
  }

  return htmlResponse(
    "You've been unsubscribed",
    "You won't receive further emails from ProFoundFinds. If this was a mistake, please email <a href=\"mailto:info@profoundfinds.com\">info@profoundfinds.com</a> and we'll add you back right away."
  );
}
