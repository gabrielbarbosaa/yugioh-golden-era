// Constantes dos cookies de sessão, usadas pelo proxy (que renova) e pelas Server Actions (que gravam).

export const ACCESS_COOKIE = "ge_access";
export const REFRESH_COOKIE = "ge_refresh";

/** O refresh token do servidor dura `REFRESH_TOKEN_TTL` (padrão da API); o cookie só precisa durar o suficiente. */
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

/** Renova o token de acesso um pouco antes de ele expirar de verdade. */
const EXPIRY_MARGIN_SECONDS = 30;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true, // o JavaScript do navegador nunca enxerga os tokens
    sameSite: "lax" as const,
    // `Secure` exige HTTPS; fora de produção (ou com COOKIE_SECURE=false) funciona em http://localhost.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function accessMaxAge(expiresIn: number): number {
  return Math.max(1, expiresIn - EXPIRY_MARGIN_SECONDS);
}
