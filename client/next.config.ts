import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the workspace types package so it can be imported from app code
  // without a separate build step.
  transpilePackages: ["@scribe/shared"],
};

export default nextConfig;
