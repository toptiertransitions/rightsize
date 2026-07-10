export interface BlastFeaturedEstate {
  name: string;
  slug: string;
  saleStartDate: string;
  description: string;
  status: string;
}

export interface BlastFeaturedItem {
  itemName: string;
  photoUrl?: string;
  valueMid?: number;
  onlineListingSlug?: string;
  category?: string;
}

export interface ShopperBlastEmailParams {
  shopperName: string;
  subject: string;
  bodyText: string; // plain paragraphs separated by \n\n
  featuredEstates: BlastFeaturedEstate[];
  featuredItems: BlastFeaturedItem[];
  unsubscribeUrl: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

function buildEstatesSection(estates: BlastFeaturedEstate[]): string {
  if (estates.length === 0) return "";

  const cards = estates
    .map((estate) => {
      const estateUrl = `https://www.profoundfinds.com/onlineestatesales/${escapeHtml(estate.slug)}`;
      const dateLabel = estate.saleStartDate
        ? `<p style="margin:4px 0 8px;font-size:13px;color:#888;">Sale begins ${escapeHtml(formatDate(estate.saleStartDate))}</p>`
        : "";
      return `
      <div style="margin-bottom:20px;padding:20px 20px 20px 23px;background:#fff;border-left:3px solid #B8960C;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
        <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:700;color:#2C2C2C;">${escapeHtml(estate.name)}</p>
        ${dateLabel}
        <p style="margin:0 0 14px;font-size:14px;color:#2C2C2C;line-height:1.6;">${escapeHtml(estate.description)}</p>
        <a href="${estateUrl}" style="display:inline-block;padding:8px 18px;background:#7A9E7E;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:500;">View This Sale &rarr;</a>
      </div>`;
    })
    .join("");

  return `
  <!-- Featured Estates -->
  <div style="margin-bottom:32px;">
    <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:#2d4a3e;padding-bottom:8px;border-bottom:1px solid #e8f0ea;">Featured Estate Sales</p>
    ${cards}
  </div>`;
}

function buildItemsSection(items: BlastFeaturedItem[]): string {
  if (items.length === 0) return "";

  // Render items in a 2-column grid using table for email client compatibility
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1] ?? null;

    const renderCell = (item: BlastFeaturedItem): string => {
      const itemUrl = item.onlineListingSlug
        ? `https://www.profoundfinds.com/shop/${escapeHtml(item.onlineListingSlug)}`
        : "https://www.profoundfinds.com/shop";
      const photo = item.photoUrl
        ? `<img src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.itemName)}" style="display:block;width:100%;max-height:200px;object-fit:cover;border-radius:4px 4px 0 0;" />`
        : "";
      const price =
        item.valueMid && item.valueMid > 0
          ? `<p style="margin:4px 0 8px;font-size:13px;color:#7A9E7E;font-weight:600;">Est. $${item.valueMid.toLocaleString()}</p>`
          : "";
      const category = item.category
        ? `<p style="margin:0 0 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(item.category)}</p>`
        : "";
      return `
      <td style="width:50%;vertical-align:top;padding:0 8px 16px;">
        <div style="background:#fff;border-radius:6px;border:1px solid #eee;overflow:hidden;">
          ${photo}
          <div style="padding:12px;">
            ${category}
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#2C2C2C;">${escapeHtml(item.itemName)}</p>
            ${price}
            <a href="${itemUrl}" style="font-size:12px;color:#B8960C;text-decoration:none;font-weight:500;">View Item &rarr;</a>
          </div>
        </div>
      </td>`;
    };

    rows.push(`
    <tr>
      ${renderCell(left)}
      ${right ? renderCell(right) : '<td style="width:50%;padding:0 8px;"></td>'}
    </tr>`);
  }

  return `
  <!-- Featured Items -->
  <div style="margin-bottom:32px;">
    <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:#2d4a3e;padding-bottom:8px;border-bottom:1px solid #e8f0ea;">Featured Items</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 -8px;">
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  </div>`;
}

export function buildShopperBlastEmail(
  params: ShopperBlastEmailParams
): string {
  const {
    shopperName,
    bodyText,
    featuredEstates,
    featuredItems,
    unsubscribeUrl,
  } = params;

  const greeting = `Hello ${escapeHtml(shopperName)},`;

  const bodyParagraphs = bodyText
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;color:#2C2C2C;line-height:1.7;">${escapeHtml(p.trim())}</p>`
    )
    .join("\n");

  const estatesHtml = buildEstatesSection(featuredEstates);
  const itemsHtml = buildItemsSection(featuredItems);

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#FAF8F5;">
    <tbody>
      <tr>
        <td style="padding:32px 16px;">

          <!-- Outer container -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;">
            <tbody>

              <!-- Header -->
              <tr>
                <td style="background:#2d4a3e;padding:32px 40px;text-align:center;border-radius:8px 8px 0 0;">
                  <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:700;color:#fff;letter-spacing:1px;">ProFoundFinds</p>
                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#a8d4bc;letter-spacing:0.3px;">Curated Estate Sales &amp; Luxury Consignment</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="background:#fff;padding:32px 40px;border-radius:0;">

                  <!-- Greeting -->
                  <p style="margin:0 0 20px;font-size:15px;color:#2C2C2C;font-weight:600;">${greeting}</p>

                  <!-- Body paragraphs -->
                  ${bodyParagraphs}

                  ${estatesHtml}
                  ${itemsHtml}

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#f9fafb;padding:24px 40px;border-radius:0 0 8px 8px;border-top:1px solid #eee;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                    <tbody>
                      <tr>
                        <td style="text-align:center;">
                          <p style="margin:0 0 8px;font-size:12px;color:#888;">Reply to this email at <a href="mailto:info@profoundfinds.com" style="color:#888;">info@profoundfinds.com</a></p>
                          <p style="margin:0 0 8px;font-size:11px;color:#aaa;">&copy; ${year} ProFoundFinds. All rights reserved.</p>
                          <p style="margin:0;font-size:11px;color:#aaa;">No longer want to receive emails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#aaa;text-decoration:underline;">Unsubscribe here</a></p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

            </tbody>
          </table>
          <!-- /Outer container -->

        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}
