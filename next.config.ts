import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/layout",
    "@react-pdf/render",
    "@react-pdf/font",
    "@react-pdf/textkit",
    "fontkit",
    "linebreak",
  ],
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
