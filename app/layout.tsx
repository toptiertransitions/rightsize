import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { unstable_cache } from "next/cache";
import { getInvoiceSettings } from "@/lib/airtable";
import { DeepLinkBootstrap } from "@/components/shared/DeepLinkBootstrap";
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
  // viewport-fit=cover lets the app extend behind the iOS notch/Dynamic Island;
  // safe-area-inset-* CSS variables then push content clear of the hardware cutouts
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      {/* The launch script below may add a class before hydration */}
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet" />
          {/* iOS app, first launch of a session: an email link (Universal
              Link) opens the app on its start page before DeepLinkBootstrap
              can move to the linked page, which flashed the sign-in screen.
              Keep the page hidden (plain background) until that check runs;
              DeepLinkBootstrap reveals it, with a 2.5s failsafe. Native only. */}
          <style dangerouslySetInnerHTML={{ __html: "html.rz-launching{background:#2d4a3e}html.rz-launching body{visibility:hidden}" }} />
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{var C=window.Capacitor;if(C&&((C.isNativePlatform&&C.isNativePlatform())||(C.getPlatform&&C.getPlatform()!=='web'))&&!sessionStorage.getItem('rz_launch_checked')){var d=document.documentElement;d.classList.add('rz-launching');setTimeout(function(){d.classList.remove('rz-launching')},2500)}}catch(e){}",
            }}
          />
        </head>
        <body>
          <DeepLinkBootstrap />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
