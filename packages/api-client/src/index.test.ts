import assert from "node:assert/strict";
import { test } from "node:test";

import { createApiClient, type TokenStore } from "./index.ts";

type Tokens = { accessToken: string; refreshToken: string } | null;

function memoryStore(initial: Tokens): TokenStore & { current: Tokens } {
  const store = {
    current: initial,
    getAccessToken: () => store.current?.accessToken ?? null,
    getRefreshToken: () => store.current?.refreshToken ?? null,
    setTokens: (t: Tokens) => {
      store.current = t;
    },
  };
  return store;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Servidor falso: /me só aceita o token "novo"; /auth/refresh troca "r1" por "novo"/"r2" uma única vez. */
function fakeServer() {
  const calls = { me: 0, refresh: 0, auth: [] as (string | null)[] };
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    if (path.endsWith("/auth/refresh")) {
      calls.refresh++;
      const { refreshToken } = (await req.json()) as { refreshToken: string };
      return refreshToken === "r1"
        ? json(200, { accessToken: "novo", refreshToken: "r2", expiresIn: 900 })
        : json(401, { title: "Unauthorized", status: 401 });
    }
    if (path.endsWith("/me")) {
      calls.me++;
      calls.auth.push(req.headers.get("Authorization"));
      return req.headers.get("Authorization") === "Bearer novo"
        ? json(200, { id: "1", username: "yugi" })
        : json(401, { title: "Unauthorized", status: 401 });
    }
    if (path.endsWith("/decks") && req.method === "POST") {
      calls.auth.push(req.headers.get("Authorization"));
      const body = (await req.json()) as { name: string };
      return req.headers.get("Authorization") === "Bearer novo"
        ? json(201, { name: body.name })
        : json(401, { title: "Unauthorized", status: 401 });
    }
    return json(404, { title: "Not Found", status: 404 });
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

test("anexa o bearer token às requisições", async () => {
  const { calls, fetchFn } = fakeServer();
  const tokens = memoryStore({ accessToken: "novo", refreshToken: "r1" });
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn });

  const { data, response } = await api.GET("/me");
  assert.equal(response.status, 200);
  assert.equal(data?.username, "yugi");
  assert.deepEqual(calls.auth, ["Bearer novo"]);
  assert.equal(calls.refresh, 0);
});

test("em 401 troca o refresh token e repete a requisição", async () => {
  const { calls, fetchFn } = fakeServer();
  const tokens = memoryStore({ accessToken: "velho", refreshToken: "r1" });
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn });

  const { data, response } = await api.GET("/me");
  assert.equal(response.status, 200);
  assert.equal(data?.username, "yugi");
  assert.equal(calls.refresh, 1);
  assert.deepEqual(tokens.current, { accessToken: "novo", refreshToken: "r2" });
});

test("repete também requisições com corpo (POST) sem perder o conteúdo", async () => {
  const { fetchFn } = fakeServer();
  const tokens = memoryStore({ accessToken: "velho", refreshToken: "r1" });
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn });

  const { data, response } = await api.POST("/decks", {
    body: { name: "Meu deck", visibility: "private", cards: { main: [], extra: [], side: [] } },
  });
  assert.equal(response.status, 201);
  assert.equal(data?.name, "Meu deck");
});

test("requisições simultâneas com 401 gastam o refresh token uma única vez", async () => {
  const { calls, fetchFn } = fakeServer();
  const tokens = memoryStore({ accessToken: "velho", refreshToken: "r1" });
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn });

  const results = await Promise.all([api.GET("/me"), api.GET("/me"), api.GET("/me")]);
  assert.deepEqual(results.map((r) => r.response.status), [200, 200, 200]);
  assert.equal(calls.refresh, 1, "o refresh token é de uso único: um segundo uso seria rejeitado");
});

test("refresh recusado limpa a sessão, avisa o app e devolve o 401", async () => {
  const { fetchFn } = fakeServer();
  const tokens = memoryStore({ accessToken: "velho", refreshToken: "revogado" });
  let expired = 0;
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn, onSessionExpired: () => expired++ });

  const { response } = await api.GET("/me");
  assert.equal(response.status, 401);
  assert.equal(tokens.current, null);
  assert.equal(expired, 1);
});

test("sem refresh token não tenta renovar", async () => {
  const { calls, fetchFn } = fakeServer();
  const tokens = memoryStore(null);
  const api = createApiClient({ baseUrl: "http://x/v1", tokens, fetch: fetchFn });

  const { response } = await api.GET("/me");
  assert.equal(response.status, 401);
  assert.equal(calls.refresh, 0);
});

test("sem TokenStore o cliente funciona anônimo (catálogo público)", async () => {
  const { fetchFn } = fakeServer();
  const api = createApiClient({ baseUrl: "http://x/v1", fetch: fetchFn });
  const { response } = await api.GET("/me");
  assert.equal(response.status, 401);
});
