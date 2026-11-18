import Link from "next/link";
import { Suspense } from "react";

import { DuelBoard } from "@/components/duel-board";
import { PageBanner } from "@/components/page-banner";
import { api } from "@/lib/api";
import { authHeaders, getCurrentUser } from "@/lib/session";

export const metadata = { title: "Duelo" };

export default function DuelPage() {
  return (
    <>
      <PageBanner title="Duelo" artCardId={46986414}>
        Protótipo de partida jogador contra jogador com regras da casa inspiradas em Forbidden Memories. Escolha um dos seus
        decks (ou um baralho aleatório da era); o servidor valida cada jogada.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando…</p>}>
        <Gate />
      </Suspense>
    </>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="muted">
        <Link href={`/login?next=${encodeURIComponent("/duel")}`}>Entre</Link> na sua conta para duelar.
      </p>
    );
  }
  const headers = await authHeaders();
  const { data } = await api.GET("/me/decks", { params: { query: { limit: 50 } }, headers });
  const decks = (data?.items ?? []).map((d) => ({ id: d.id, name: d.name }));
  return (
    <DuelBoard
      decks={decks}
      wsUrl={process.env.NEXT_PUBLIC_DUEL_WS_URL ?? "ws://localhost:8787"}
      imageBase={process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "http://localhost:8080/images"}
    />
  );
}
