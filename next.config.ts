import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  turbopack: {
    root: import.meta.dirname
  }
};

export default nextConfig;
