import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { DeckEditor } from "@/components/deck-editor";
import { PageBanner } from "@/components/page-banner";
import { api, describeError } from "@/lib/api";
import { authHeaders, getCurrentUser } from "@/lib/session";

type Params = Promise<{ id: string }>;

export const metadata = { title: "Editar deck" };

export default function EditDeckPage({ params }: { params: Params }) {
  return (
    <>
      <PageBanner title="Editar deck" artCardId={46986414}>
        Altere nome, cartas e visibilidade. As regras da era (limites de cópias, lista de proibidas) são conferidas ao salvar.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando deck…</p>}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const [me, headers] = await Promise.all([getCurrentUser(), authHeaders()]);
  if (!me || !headers) redirect(`/login?next=${encodeURIComponent(`/decks/${id}/edit`)}`);

  const res = await api.GET("/decks/{deckId}", { params: { path: { deckId: id } }, headers });
  if (res.response.status === 404 || res.response.status === 422) notFound();
  if (!res.data) throw new Error(describeError(res.error));
  const deck = res.data;
  if (deck.owner.id !== me.id) redirect(`/decks/${id}`); // só o dono edita

  const ids = [...new Set([...deck.cards.main, ...deck.cards.extra, ...deck.cards.side].map((e) => e.cardId))];
  const { data: page } = ids.length ? await api.GET("/cards", { params: { query: { ids, limit: 100 } } }) : { data: undefined };
  const known = (page?.items ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type, imageSmallUrl: c.imageSmallUrl, maxCopies: c.maxCopies }));

  return (
    <DeckEditor
      initial={{ deckId: deck.id, name: deck.name, description: deck.description, visibility: deck.visibility, cards: deck.cards, known }}
    />
  );
}