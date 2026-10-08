import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En production, `/media/…` est réécrit vers R2 par vercel.json (avec le
  // cache Vercel). `next dev` ne lit pas vercel.json : même règle ici, en local.
  async rewrites() {
    const r2 = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (process.env.NODE_ENV !== "development" || !r2) return [];
    return [{ source: "/media/:path*", destination: `${r2}/:path*` }];
  },
};

export default nextConfig;
