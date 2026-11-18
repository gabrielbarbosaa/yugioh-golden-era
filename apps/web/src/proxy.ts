import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  accessMaxAge,
  cookieOptions,
} from "@/lib/session-cookies";

// Formatos que a API aceita. Um id fora do formato nunca existe, então dá para responder 404 sem chamar a API.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

/**
 * Com Cache Components a página começa a ser enviada (status 200) antes de os dados chegarem, então um
 * `notFound()` depois disso só troca o conteúdo (e acrescenta `noindex`), sem mudar o status. Aqui, no proxy
 * (que roda antes de renderizar), devolvemos 404 de verdade para endereços de formato impossível.
 * Ids bem formados mas inexistentes continuam com 200 + noindex: confirmar exigiria uma chamada à API em toda visita.
 */
function malformedAddress(pathname: string): boolean {
  let m: RegExpExecArray | null;
  if ((m = /^\/cards\/([^/]+)\/?$/.exec(pathname))) return !/^\d{1,18}$/.test(m[1]);
  if ((m = /^\/decks\/([^/]+)\/?$/.exec(pathname))) return m[1] !== "new" && !UUID_RE.test(m[1]);
  if ((m = /^\/decks\/([^/]+)\/edit\/?$/.exec(pathname))) return !UUID_RE.test(m[1]);
  if ((m = /^\/users\/([^/]+)\/?$/.exec(pathname))) return !USERNAME_RE.test(decodeURIComponent(m[1]));
  if ((m = /^\/users\/([^/]+)\/(?:followers|following)\/?$/.exec(pathname))) return !USERNAME_RE.test(decodeURIComponent(m[1]));
  return false;
}

/**
 * Renova a sessão. O cookie de acesso expira junto com o token; quando some mas ainda há refresh token,
 * trocamos por um par novo ANTES de renderizar (componentes de servidor não conseguem gravar cookies).
 *
 * O refresh token é de uso único. Se duas requisições (ex.: prefetches) renovarem ao mesmo tempo, só a primeira
 * vence; a outra segue como visitante e NÃO apaga os cookies, para não derrubar a sessão que acabou de renovar.
 */
export async function proxy(request: NextRequest) {
  try {
    if (malformedAddress(request.nextUrl.pathname)) {
      // Reescreve para um caminho que não existe: o Next responde com a página "não encontrado" e status 404.
      return NextResponse.rewrite(new URL("/_nao-encontrado", request.url));
    }
  } catch {
    // decodeURIComponent falha em "%" solto: também é um endereço inválido.
    return NextResponse.rewrite(new URL("/_nao-encontrado", request.url));
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken || request.cookies.get(ACCESS_COOKIE)) return NextResponse.next();

  let tokens: { accessToken: string; refreshToken: string; expiresIn: number } | null = null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.ok) tokens = await res.json();
  } catch {
    // API fora do ar: a página decide o que mostrar.
  }
  if (!tokens) return NextResponse.next();

  // Os cookies novos valem já para esta renderização (request) e para as próximas (response).
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(accessMaxAge(tokens.expiresIn)));
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
