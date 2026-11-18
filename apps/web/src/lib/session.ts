import { cookies } from "next/headers";

import { api } from "@/lib/api";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

/** Lê o token de acesso do cookie. Só existe no pedido, então use dentro de <Suspense> ou de uma Server Action. */
export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Cabeçalho para chamadas autenticadas à API; vazio para visitantes. */
export async function authHeaders(): Promise<{ Authorization: string } | undefined> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export type CurrentUser = { id: string; username: string; avatarUrl: string | null };

/** Usuário da sessão, ou `null` se não há sessão (ou o token foi recusado). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const { data } = await api.GET("/me", { headers });
  return data ? { id: data.id, username: data.username, avatarUrl: data.avatarUrl ?? null } : null;
}
