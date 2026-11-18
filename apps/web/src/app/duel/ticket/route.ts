import { NextResponse } from "next/server";

import { getAccessToken } from "@/lib/session";

/** Endereço (do servidor do site) do servidor de duelo; o navegador só enxerga o endereço do WebSocket. */
const DUEL_HTTP_URL = process.env.DUEL_HTTP_URL ?? "http://localhost:8787";

/**
 * Troca a sessão (cookie httpOnly, que o JavaScript do navegador não lê) por um ingresso curto de uso único para o
 * WebSocket. O token de acesso nunca sai do servidor do site.
 */
export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "faça login para jogar" }, { status: 401 });
  // Deck escolhido (opcional). Quem o lê da API, com o token do dono, é o servidor de duelo.
  const body = (await request.json().catch(() => ({}))) as { deckId?: unknown };
  const deckId = typeof body.deckId === "string" && body.deckId ? body.deckId : undefined;
  try {
    const res = await fetch(`${DUEL_HTTP_URL}/tickets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: deckId ? JSON.stringify({ deckId }) : undefined,
      cache: "no-store",
    });
    if (res.status === 404) return NextResponse.json({ error: "deck não encontrado" }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: "sessão recusada pelo servidor de duelo" }, { status: res.status === 401 ? 401 : 502 });
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "servidor de duelo indisponível" }, { status: 503 });
  }
}
