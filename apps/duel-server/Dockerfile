# Imagem do servidor de duelo (WebSocket). O contexto de build é a RAIZ do repositório:
#   docker build -f apps/duel-server/Dockerfile -t golden-era-duel .
# Em runtime defina API_URL (ex.: http://api:8080/v1); veja o docker-compose.yml (perfil `app`).
# O Node 24 executa TypeScript direto (remove os tipos), então não há etapa de build.
FROM node:24-alpine
WORKDIR /repo
ENV NODE_ENV=production PORT=8787

COPY package.json package-lock.json ./
COPY apps/duel-server/package.json apps/duel-server/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api-client/package.json packages/api-client/
COPY packages/duel-engine/package.json packages/duel-engine/
RUN npm ci --workspace @golden-era/duel-server --include-workspace-root --omit=dev

COPY packages/duel-engine packages/duel-engine
COPY apps/duel-server/src apps/duel-server/src

USER node
EXPOSE 8787
WORKDIR /repo/apps/duel-server
CMD ["node", "src/main.ts"]
