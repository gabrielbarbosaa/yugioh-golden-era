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

/**
 * Renova a sessão. O cookie de acesso expira junto com o token; quando some mas ainda há refresh token,
 * trocamos por um par novo ANTES de renderizar (componentes de servidor não conseguem gravar cookies).
 *
 * O refresh token é de uso único. Se duas requisições (ex.: prefetches) renovarem ao mesmo tempo, só a primeira
 * vence; a outra segue como visitante e NÃO apaga os cookies, para não derrubar a sessão que acabou de renovar.
 */
export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;  if (!refreshToken || request.cookies.get(ACCESS_COOKIE)) return NextResponse.next();

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
