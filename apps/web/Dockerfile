# Imagem do site Next.js. O contexto de build é a RAIZ do repositório (o site usa o workspace npm):
#   docker build -f apps/web/Dockerfile -t golden-era-web .
# Em runtime defina API_URL (ex.: http://api:8080/v1); veja o docker-compose.yml (perfil `app`).
FROM node:24-alpine AS base
WORKDIR /repo

# 1) Dependências: só dos workspaces do site. Os package.json dos demais entram para o lockfile continuar válido.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --workspace @golden-era/web --include-workspace-root

# 2) Build (output "standalone": .next/standalone com o servidor e só os node_modules necessários).
FROM deps AS build
COPY apps/web apps/web
COPY packages/api-client packages/api-client
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @golden-era/web

# 3) Runtime enxuto, sem root.
FROM base AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
