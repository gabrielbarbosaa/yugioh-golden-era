# Golden Era – app mobile (Expo)

App em React Native + Expo Router (SDK 58) para o catálogo de cartas e os decks da era Duel Monsters.
Fala com a API em Go da raiz do repositório por meio de `@golden-era/api-client` (tipos gerados do OpenAPI).

## Rodando

1. Suba a API (na raiz do repositório):

   ```bash
   docker compose up -d --wait
   go run ./cmd/api
   ```

2. Instale as dependências **na raiz** (é um workspace npm) e inicie o app:

   ```bash
   npm install
   npm run mobile
   ```

   No terminal do Expo: `w` abre no navegador, `a` no emulador Android; ou leia o QR code com o app **Expo Go**.

## Celular físico

`localhost` aponta para o próprio celular. Use o IP da sua máquina na rede (veja `.env.example`):

```bash
# 1) API: as URLs das imagens também precisam do IP
IMAGE_BASE_URL=http://SEU_IP:8080/images go run ./cmd/api

# 2) App
EXPO_PUBLIC_API_URL=http://SEU_IP:8080/v1 npm run mobile
```

(No PowerShell: `$env:IMAGE_BASE_URL='http://SEU_IP:8080/images'; go run ./cmd/api` e `$env:EXPO_PUBLIC_API_URL='http://SEU_IP:8080/v1'; npm run mobile`.)

## Verificações

```bash
npm run typecheck          # na raiz: api-client + app
npm test -w @golden-era/api-client
npx eslint src             # dentro de apps/mobile
```

## Estrutura

- `src/app/` – rotas (Expo Router): `(tabs)/` com Cartas e Decks, e `card/[id]` (detalhe).
- `src/lib/api.ts` – instância do cliente da API.
- `src/hooks/use-paged-list.ts` – lista paginada por cursor, usada nas telas.

Veja também `AGENTS.md` (convenções do template Expo).
