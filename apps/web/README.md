# Golden Era – site (Next.js)

Site público do Golden Era (Next.js 16, App Router, Cache Components). Mostra o catálogo de cartas, o marketplace de decks,
decks públicos e perfis. Busca tudo no servidor, pelo `@golden-era/api-client`, na API em Go da raiz do repositório.

## Rodando

1. Suba a API (na raiz): `docker compose up -d --wait` e `go run ./cmd/api`.
2. Na raiz do repositório: `npm install` e depois `npm run web` (http://localhost:3000).

`API_URL` (padrão `http://localhost:8080/v1`) é lida só no servidor. `COOKIE_SECURE=false` permite os cookies de sessão
em HTTP fora do localhost (em produção, use HTTPS). As imagens vêm da própria API
(`IMAGE_BASE_URL` da API), então o navegador precisa alcançar essa URL.

## Verificações

```bash
npm run typecheck        # na raiz
npx next build           # dentro de apps/web (valida as regras do Cache Components)
npx eslint               # dentro de apps/web
```

## Estrutura

- `src/app/` – rotas: `/` (cartas), `cards/[id]`, `decks`, `decks/[id]`, `users/[username]`.
- Tudo que depende de `params`/`searchParams` fica dentro de `<Suspense>`: o shell é pré-renderizado e os dados chegam por streaming.
- Login, cadastro e sair (`/login`, `/register`) guardam a sessão em cookies httpOnly; o `src/proxy.ts` renova o token de acesso.
  Com sessão dá para curtir e comentar nos decks públicos (e ver os próprios decks privados). Montar decks, coleção e copiar decks ficam no app.

Veja `AGENTS.md`: esta versão do Next muda APIs e convenções; leia `node_modules/next/dist/docs/` antes de mexer.