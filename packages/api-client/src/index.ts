import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export type { components, paths };

/** Atalhos para os tipos do contrato (gerados de api/openapi.yaml). */
export type Schemas = components["schemas"];
export type Card = Schemas["Card"];
export type CardPage = Schemas["CardPage"];
export type Deck = Schemas["Deck"];
export type DeckSummary = Schemas["DeckSummary"];
export type DeckInput = Schemas["DeckInput"];
export type Profile = Schemas["Profile"];
export type AuthTokens = Schemas["AuthTokens"];

/**
 * Onde o app guarda a sessão. No mobile use SecureStore; no site, cookies ou memória.
 * O cliente só lê e grava por aqui, então ele não depende de nenhuma plataforma.
 */
export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  /** Chamado após login/refresh com o novo par, ou com `null` quando a sessão acaba. */
  setTokens(tokens: { accessToken: string; refreshToken: string } | null): void | Promise<void>;
}

export interface ApiClientOptions {
  /** URL base incluindo o prefixo da versão, ex.: `http://localhost:8080/v1`. */
  baseUrl: string;
  tokens?: TokenStore;
  /** Chamado quando o refresh falha e o usuário precisa entrar de novo. */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}

/** Rotas de auth não carregam o bearer token nem disparam refresh automático. */
const isAuthPath = (url: string) => /\/auth\/(login|register|refresh)$/.test(new URL(url).pathname);

/**
 * Cria o cliente tipado. Com `tokens`, anexa o `Authorization: Bearer` e, ao receber 401,
 * troca o refresh token (uso único) por um novo par e repete a requisição uma vez.
 */
export function createApiClient({ baseUrl, tokens, onSessionExpired, fetch: fetchImpl }: ApiClientOptions) {
  const doFetch: typeof fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const client = createClient<paths>({
    baseUrl,
    fetch: (req) => doFetch(req),
    // A API espera listas separadas por vírgula (`ids=1,2,3`), não `ids=1&ids=2`.
    querySerializer: { array: { style: "form", explode: false } },
  });

  if (tokens) {
    const originals = new WeakMap<Request, Request>();
    let refreshing: Promise<string | null> | null = null;

    // Várias requisições podem receber 401 ao mesmo tempo; só uma deve gastar o refresh token.
    const refresh = (): Promise<string | null> => {
      refreshing ??= (async () => {
        const refreshToken = await tokens.getRefreshToken();
        if (!refreshToken) return null;
        const res = await doFetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await tokens.setTokens(null);
          onSessionExpired?.();
          return null;
        }
        const next = (await res.json()) as AuthTokens;
        await tokens.setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
        return next.accessToken;
      })().finally(() => {
        refreshing = null;
      });
      return refreshing;
    };

    const auth: Middleware = {
      async onRequest({ request }) {
        if (isAuthPath(request.url)) return undefined;
        originals.set(request, request.clone()); // o corpo é consumido no envio; guardamos uma cópia para o retry
        const token = await tokens.getAccessToken();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
      async onResponse({ request, response }) {
        if (response.status !== 401 || isAuthPath(request.url)) return undefined;
        const original = originals.get(request);
        if (!original) return undefined;
        const token = await refresh();
        if (!token) return undefined; // sem sessão: devolve o 401 original
        original.headers.set("Authorization", `Bearer ${token}`);
        return doFetch(original);
      },
    };
    client.use(auth);
  }

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
