import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local check builds and previews set NEXT_DIST_DIR (e.g. ".next-build")
  // so they never overwrite the files a running `next dev` is using.
  // Unset everywhere else, including Vercel, so it stays ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/layout",
    "@react-pdf/render",
    "@react-pdf/font",
    "@react-pdf/textkit",
    "fontkit",
    "linebreak",
  ],
  // Fonts and images for the review collateral PDF (lib/review-collateral),
  // read from disk at render time, so they must ship with these functions
  outputFileTracingIncludes: {
    "/api/tenants/[id]/reviews": ["./lib/review-collateral/assets/**"],
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/home", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.squarespace-cdn.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
