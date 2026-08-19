import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fitai/contracts"],
};

export default nextConfig;
