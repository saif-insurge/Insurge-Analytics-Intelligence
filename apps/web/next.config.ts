import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ga4-audit/audit-core",
    "@ga4-audit/db",
    "@ga4-audit/pdf",
  ],
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
