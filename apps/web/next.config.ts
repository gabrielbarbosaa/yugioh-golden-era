import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // O cliente da API é consumido como código-fonte TypeScript (sem etapa de build).
  transpilePackages: ["@golden-era/api-client"],
  // Servidor autocontido para a imagem Docker (`.next/standalone`, só com o que o site usa).
  output: "standalone",
  // O workspace npm fica na raiz do repositório; sem isto o rastreamento de arquivos perderia @golden-era/api-client.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
};

export default nextConfig;
