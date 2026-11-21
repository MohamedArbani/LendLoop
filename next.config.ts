import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Clerk's same-origin rewrite must keep the server's original loopback hostname.
  skipProxyUrlNormalize: true,
  distDir: process.env.LENDLOOP_E2E === "1" ? ".next/e2e" : undefined,
};

export default nextConfig;
