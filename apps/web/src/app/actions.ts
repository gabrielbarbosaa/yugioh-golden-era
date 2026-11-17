"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { api, describeError } from "@/lib/api";
import { authHeaders } from "@/lib/session";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  accessMaxAge,
  cookieOptions,
} from "@/lib/session-cookies";

/** Estado dos formulários; `email`/`username` voltam para repovoar os campos (o React limpa o form após a ação). */
export type FormState = { error: string | null; email?: string; username?: string };

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

/** Só aceita caminhos internos (`/algo`), para o parâmetro `next` não virar redirecionamento aberto. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

async function startSession(tokens: Tokens) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(accessMaxAge(tokens.expiresIn)));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function login(_prev: FormState, data: FormData): Promise<FormState> {
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Preencha o e-mail e a senha.", email };

  let tokens: Tokens | undefined;
  try {
    const res = await api.POST("/auth/login", { body: { email, password } });
    if (!res.data) return { error: describeError(res.error), email };
    tokens = res.data;
  } catch {
    return { error: "Não foi possível falar com a API.", email };
  }
  await startSession(tokens);
  redirect(safeNext(data.get("next")));
}

export async function register(_prev: FormState, data: FormData): Promise<FormState> {
  const email = text(data, "email");
  const username = text(data, "username");
  const password = String(data.get("password") ?? "");
  const keep = { email, username };
  if (!email || !username || !password) return { error: "Preencha todos os campos.", ...keep };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", ...keep };

  let tokens: Tokens | undefined;
  try {
    // O limite de cadastros da API é por IP. Repassamos o IP de quem está no navegador (a API só o usa se
    // TRUST_PROXY=true; senão enxerga o IP deste servidor e todos os cadastros da web dividem um limite).
    const forwarded = (await headers()).get("x-forwarded-for");
    const res = await api.POST("/auth/register", {
      body: { email, username, password },
      headers: forwarded ? { "X-Forwarded-For": forwarded } : undefined,
    });
    if (!res.data) {
      const problem = res.error as { errors?: { message?: string }[] } | undefined;
      const reasons = (problem?.errors ?? []).map((e) => e.message).filter(Boolean);
      return { error: reasons.length ? reasons.join(" ") : describeError(res.error), ...keep };
    }
    tokens = res.data;
  } catch {
    return { error: "Não foi possível falar com a API.", ...keep };
  }
  await startSession(tokens);
  redirect(safeNext(data.get("next")));
}

export async function logout() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const headers = await authHeaders();
  if (refreshToken && headers) {
    try {
      // Revoga o refresh token no servidor; se falhar, a sessão local acaba do mesmo jeito.
      await api.POST("/auth/logout", { body: { refreshToken }, headers });
    } catch {}
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect("/");
}

/** Curtir/descurtir. O servidor revalida o token a cada chamada; aqui só buscamos o cabeçalho. */
export async function setLike(deckId: string, like: boolean) {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);

  const params = { params: { path: { deckId } }, headers };
  const res = like ? await api.PUT("/decks/{deckId}/like", params) : await api.DELETE("/decks/{deckId}/like", params);
  if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);
  revalidatePath(`/decks/${deckId}`);
}

export async function addComment(deckId: string, _prev: FormState, data: FormData): Promise<FormState> {
  const body = text(data, "body");
  if (!body) return { error: "Escreva um comentário." };
  if (body.length > 1000) return { error: "O comentário pode ter no máximo 1000 caracteres." };

  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);

  let res;
  try {
    res = await api.POST("/decks/{deckId}/comments", { params: { path: { deckId } }, body: { body }, headers });
  } catch {
    return { error: "Não foi possível falar com a API." };
  }
  if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);
  if (!res.data) return { error: describeError(res.error) };
  revalidatePath(`/decks/${deckId}`);
  return { error: null };
}
