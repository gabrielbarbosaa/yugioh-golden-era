import type { Card, Schemas } from "@golden-era/api-client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { setLike } from "@/app/actions";
import { CommentForm } from "@/components/comment-form";
import { api, describeError } from "@/lib/api";
import { authHeaders } from "@/lib/session";

type Params = Promise<{ id: string }>;
type Entry = Schemas["DeckCardEntry"];

const ZONES = [
  { key: "main", label: "Deck principal" },
  { key: "extra", label: "Extra Deck" },
  { key: "side", label: "Side Deck" },
] as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const { data } = await api.GET("/decks/{deckId}", { params: { path: { deckId: id } } });
  return data ? { title: data.name, description: data.description.slice(0, 160) || undefined } : {};
}

export default function DeckPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="skeleton">Carregando deck…</p>}>
      <DeckDetail params={params} />
    </Suspense>
  );
}

async function DeckDetail({ params }: { params: Params }) {
  const { id } = await params;
  // Com sessão, o dono também vê o próprio deck privado e `likedByMe` vem preenchido. Um token recusado
  // (expirado ou revogado) faz a rota de acesso opcional responder 401: nesse caso seguimos como visitante.
  let headers = await authHeaders();
  let res = await api.GET("/decks/{deckId}", { params: { path: { deckId: id } }, headers });
  if (res.response.status === 401) {
    headers = undefined;
    res = await api.GET("/decks/{deckId}", { params: { path: { deckId: id } } });
  }
  const { data: deck, error, response } = res;
  if (response.status === 404 || response.status === 422) notFound();
  if (!deck) throw new Error(describeError(error));
  const signedIn = headers !== undefined;

  // O deck só traz ids e quantidades; os dados das cartas vêm em uma única chamada (máx. 100 ids).
  const ids = [...new Set(ZONES.flatMap((z) => deck.cards[z.key].map((e) => e.cardId)))];
  const { data: page } = ids.length
    ? await api.GET("/cards", { params: { query: { ids, limit: 100 } } })
    : { data: undefined };
  const cards = new Map<number, Card>((page?.items ?? []).map((c) => [c.id, c]));

  const { data: comments } = await api.GET("/decks/{deckId}/comments", {
    params: { path: { deckId: id }, query: { limit: 50 } },
  });

  return (
    <>
      <h1>{deck.name}</h1>
      <p className="muted">
        por{" "}
        <Link href={`/users/${deck.owner.username}`}>
          <strong>@{deck.owner.username}</strong>
        </Link>
        {deck.archetype ? ` · ${deck.archetype}` : ""} · ♥ {deck.likeCount} · 💬 {deck.commentCount}
      </p>
      {deck.description ? <p style={{ whiteSpace: "pre-line" }}>{deck.description}</p> : null}

      {deck.visibility === "public" ? (
        signedIn ? (
          <form action={setLike.bind(null, id, !deck.likedByMe)} className="like-form">
            <button className="button" type="submit">
              {deck.likedByMe ? "♥ Curtido" : "♡ Curtir"} · {deck.likeCount}
            </button>
          </form>
        ) : (
          <p className="muted">
            <Link href={`/login?next=${encodeURIComponent(`/decks/${id}`)}`}>Entre</Link> para curtir e comentar.
          </p>
        )
      ) : (
        <p className="muted">Deck privado: só você vê esta página.</p>
      )}

      {ZONES.map(({ key, label }) => {
        const entries: Entry[] = deck.cards[key];
        const total = entries.reduce((sum, e) => sum + e.quantity, 0);
        return (
          <section key={key}>
            <h2>
              {label} · {total}
            </h2>
            {entries.length === 0 ? (
              <p className="muted">Nenhuma carta.</p>
            ) : (
              <ul className="card-grid">
                {entries.map((e) => {
                  const card = cards.get(e.cardId);
                  return (
                    <li key={e.cardId}>
                      <Link href={`/cards/${e.cardId}`}>
                        {card ? (
                          <Image src={card.imageSmallUrl} alt={card.name} width={118} height={172} unoptimized />
                        ) : null}
                        <span className="qty">{e.quantity}×</span> {card?.name ?? `Carta ${e.cardId}`}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <section>
        <h2>Comentários</h2>
        {comments?.items.length ? (
          comments.items.map((c) => (
            <div className="comment" key={c.id}>
              <Link href={`/users/${c.author.username}`}>
                <strong>@{c.author.username}</strong>
              </Link>
              <p>{c.body}</p>
            </div>
          ))
        ) : (
          <p className="muted">Ainda não há comentários.</p>
        )}
        {deck.visibility === "public" && signedIn ? <CommentForm deckId={id} /> : null}
        <p className="muted">Para copiar este deck ou montar os seus, use o app Golden Era.</p>
      </section>
    </>
  );
}
