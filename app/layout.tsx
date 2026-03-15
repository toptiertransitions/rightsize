import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { unstable_cache } from "next/cache";
import { getInvoiceSettings } from "@/lib/airtable";
import "./globals.css";

// Prevent static pre-rendering; Clerk requires runtime auth context
export const dynamic = "force-dynamic";

// Cache the logo URL for 1 hour so every page load doesn't hit Airtable
const getCachedLogoUrl = unstable_cache(
  async () => {
    const settings = await getInvoiceSettings().catch(() => null);
    return settings?.logoUrl || null;
  },
  ["invoice-settings-logo"],
  { revalidate: 3600 }
);

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getCachedLogoUrl();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";
  return {
    title: "Rightsize by Top Tier",
    description:
      "The all-in-one platform for senior downsizing — catalog, estimate, and plan your move with confidence.",
    metadataBase: new URL(appUrl),
    ...(logoUrl && {
      icons: {
        icon: logoUrl,
        shortcut: logoUrl,
        apple: logoUrl,
      },
    }),
  };
}

export const viewport: Viewport = {
  themeColor: "#2E6B4F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet" />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
