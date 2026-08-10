import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/v/:token",
        destination: "/adult-verify/:token",
      },
    ];
  },
};

export default nextConfig;
