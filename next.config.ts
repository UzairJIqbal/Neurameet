import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a platform-specific native binary and resolves its path
  // from __dirname at runtime. If Next bundles it, that path points into the
  // webpack vendor chunks where no binary exists, so spawning ffmpeg fails with
  // ENOENT. Keep both packages external so require() resolves the real binary
  // from node_modules at runtime (local dev and Vercel alike).
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
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
