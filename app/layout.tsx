import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Prevent static pre-rendering; Clerk requires runtime auth context
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rightsize by Top Tier",
  description:
    "The all-in-one platform for senior downsizing — catalog, estimate, and plan your move with confidence.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
};

export const viewport: Viewport = {
  themeColor: "#2E6B4F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
