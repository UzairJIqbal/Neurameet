import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Pre-existing ESLint flat-config hang in this project (env-only, not app
    // code). Per project decision, skip lint during build; rely on `tsc --noEmit`
    // as the real type/correctness gate. Do not chase the tooling bug.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
