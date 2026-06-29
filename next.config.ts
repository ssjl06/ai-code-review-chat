import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for the all-in-one image
  // (Dockerfile / codereview.def set NEXT_OUTPUT_STANDALONE=1). For the
  // "env SIF + source on host" model we leave it off and run `next start`.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
