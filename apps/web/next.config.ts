import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // O cliente da API é consumido como código-fonte TypeScript (sem etapa de build).
  transpilePackages: ["@golden-era/api-client"],
};

export default nextConfig;
