"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { api, describeError } from "@/lib/api";
import { addCard, canAdd, copiesOf, homeZone, ZONE_LABEL, type CardLite, type DeckCards } from "@/lib/deck-rules";
import { authHeaders, getCurrentUser } from "@/lib/session";
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

/**
 * Ajusta quantas cópias de uma carta o jogador tem. A API só sabe substituir a coleção inteira, então lemos a
 * coleção atual, trocamos a quantidade desta carta e gravamos de volta (a última edição vence, como no app).
 */
export async function setOwned(cardId: number, quantity: number) {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent("/collection")}`);

  const q = Math.max(0, Math.min(999, Math.round(quantity)));
  const current = await api.GET("/me/collection", { headers });
  if (current.response.status === 401) redirect(`/login?next=${encodeURIComponent("/collection")}`);
  if (!current.data) return;

  const items = new Map(current.data.map((i) => [i.cardId, i.quantity]));
  if (q === 0) items.delete(cardId);
  else items.set(cardId, q);
  await api.PUT("/me/collection", {
    body: [...items].map(([id, n]) => ({ cardId: id, quantity: n })),
    headers,
  });
  revalidatePath("/collection");
  revalidatePath(`/cards/${cardId}`);
}

/** Copia um deck de personagem do anime para a conta (rascunho privado) e abre o deck criado. */
export async function importAnimeDeck(slug: string) {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent("/")}`);

  const res = await api.POST("/anime-decks/{slug}/import", { params: { path: { slug } }, headers });
  if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent("/")}`);
  if (!res.data) throw new Error(describeError(res.error));
  redirect(`/decks/${res.data.id}`);
}

/** Frase para o erro da API; em 422 junta as mensagens por campo (ex.: carta proibida, deck principal curto). */
function problemText(error: unknown): string {
  const problem = error as { errors?: { message?: string }[] } | undefined;
  const reasons = (problem?.errors ?? []).map((e) => e.message).filter(Boolean);
  return reasons.length ? reasons.join(" ") : describeError(error);
}

export type DeckDraft = { name: string; description: string; visibility: "private" | "public"; cards: DeckCards };

/**
 * Cria (`deckId` nulo) ou substitui um deck do usuário. Em caso de sucesso abre o deck; em erro devolve a mensagem
 * da API (a API é quem valida as regras).
 */
export async function saveDeck(deckId: string | null, draft: DeckDraft): Promise<{ error: string }> {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(deckId ? `/decks/${deckId}/edit` : "/decks/new")}`);

  const body = { name: draft.name.trim(), description: draft.description, visibility: draft.visibility, cards: draft.cards };
  if (!body.name) return { error: "Dê um nome ao deck." };

  let id: string;
  try {
    const res = deckId
      ? await api.PUT("/decks/{deckId}", { params: { path: { deckId } }, body, headers })
      : await api.POST("/decks", { body, headers });
    if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent("/")}`);
    if (!res.data) return { error: problemText(res.error) };
    id = res.data.id;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() do Next sobe como exceção
    return { error: "Não foi possível falar com a API." };
  }
  revalidatePath(`/decks/${id}`);
  redirect(`/decks/${id}`);
}

/**
 * Soma uma cópia da carta a um deck do usuário (no deck principal ou no Extra Deck, conforme a carta). A carta é lida
 * da API (o cliente só diz o id), as regras do cliente dão a mensagem e a API continua sendo quem valida ao salvar.
 */
export async function addCardToDeck(deckId: string, cardId: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(`/cards/${cardId}`)}`);
  if (!Number.isSafeInteger(cardId) || !/^[0-9a-f-]{36}$/i.test(deckId)) return { ok: false, error: "Pedido inválido." };

  try {
    const [deckRes, cardRes] = await Promise.all([
      api.GET("/decks/{deckId}", { params: { path: { deckId } }, headers }),
      api.GET("/cards/{cardId}", { params: { path: { cardId } } }),
    ]);
    if (deckRes.response.status === 401) redirect(`/login?next=${encodeURIComponent(`/cards/${cardId}`)}`);
    if (!deckRes.data) return { ok: false, error: problemText(deckRes.error) };
    if (!cardRes.data) return { ok: false, error: problemText(cardRes.error) };
    const deck = deckRes.data;
    const card = cardRes.data;

    const zone = homeZone(card);
    const refusal = canAdd(deck.cards, zone, card);
    if (refusal) return { ok: false, error: refusal };

    const cards = addCard(deck.cards, zone, card.id);
    const res = await api.PUT("/decks/{deckId}", {
      params: { path: { deckId } },
      body: { name: deck.name, description: deck.description, visibility: deck.visibility, cards },
      headers,
    });
    if (!res.data) return { ok: false, error: problemText(res.error) };

    revalidatePath(`/decks/${deckId}`);
    const copies = copiesOf(cards, card.id);
    return { ok: true, message: `${card.name} adicionada a "${deck.name}" (${ZONE_LABEL[zone]}): agora ${copies} ${copies === 1 ? "cópia" : "cópias"}.` };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() do Next sobe como exceção
    return { ok: false, error: "Não foi possível falar com a API." };
  }
}
/** Segue (`follow` verdadeiro) ou deixa de seguir um usuário; as duas operações são idempotentes na API. */
export async function setFollow(username: string, follow: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(`/users/${username}`)}`);
  try {
    const params = { params: { path: { username } }, headers };
    const res = follow ? await api.PUT("/users/{username}/follow", params) : await api.DELETE("/users/{username}/follow", params);
    if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent(`/users/${username}`)}`);
    if (!res.response.ok) return { ok: false, error: problemText(res.error) };
    revalidatePath(`/users/${username}`);
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() do Next sobe como exceção
    return { ok: false, error: "Não foi possível falar com a API." };
  }
}

/** Define a carta da foto de perfil (`0` remove a foto). A API valida que a carta existe. */
export async function setAvatarCard(cardId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) redirect("/login");
  if (!Number.isSafeInteger(cardId) || cardId < 0) return { ok: false, error: "Carta inválida." };
  try {
    const res = await api.PATCH("/me", { body: { avatarCardId: cardId }, headers });
    if (res.response.status === 401) redirect("/login");
    if (!res.data) return { ok: false, error: problemText(res.error) };
    revalidatePath(`/users/${res.data.username}`);
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() do Next sobe como exceção
    return { ok: false, error: "Não foi possível falar com a API." };
  }
}

/** Exclui um deck do usuário e volta ao perfil. */
export async function deleteDeck(deckId: string) {
  const headers = await authHeaders();
  if (!headers) redirect("/login");
  const res = await api.DELETE("/decks/{deckId}", { params: { path: { deckId } }, headers });
  if (!res.response.ok) throw new Error(describeError(res.error));
  const me = await getCurrentUser();
  redirect(me ? `/users/${me.username}` : "/");
}

/** Copia um deck público para a conta (rascunho privado) e abre o editor. */
export async function copyDeck(deckId: string) {
  const headers = await authHeaders();
  if (!headers) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);
  const res = await api.POST("/decks/{deckId}/copy", { params: { path: { deckId } }, headers });
  if (res.response.status === 401) redirect(`/login?next=${encodeURIComponent(`/decks/${deckId}`)}`);
  if (!res.data) throw new Error(describeError(res.error));
  redirect(`/decks/${res.data.id}/edit`);
}

/** Busca por nome para o editor (o navegador não fala com a API, então a busca passa por aqui). */
export async function searchCards(q: string): Promise<CardLite[]> {
  const text = q.trim().slice(0, 100);
  if (text.length < 2) return [];
  const { data } = await api.GET("/cards", { params: { query: { q: text, limit: 24 } } });
  return (data?.items ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type, imageSmallUrl: c.imageSmallUrl, maxCopies: c.maxCopies }));
}