import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LimitBadge } from "@/components/limit-badge";
import { PageBanner } from "@/components/page-banner";
import { QtyForms } from "@/components/owned-control";
import { Pager, withQuery } from "@/components/pager";
import { api, describeError } from "@/lib/api";
import { authHeaders } from "@/lib/session";

export const metadata = { title: "Minha coleção" };

type SearchParams = Promise<{ page?: string }>;

const PAGE_SIZE = 60;

export default function CollectionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageBanner title="Minha coleção" artCardId={38033121}>
        Registre quantas cópias de cada carta você tem; o editor de decks do app usa isso para avisar o que falta.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando coleção…</p>}>
        <Owned searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Owned({ searchParams }: { searchParams: SearchParams }) {
  const headers = await authHeaders();
  const res = headers ? await api.GET("/me/collection", { headers }) : null;
  if (res && !res.data && res.response.status !== 401) throw new Error(describeError(res.error));
  if (!res?.data) {
    return (
      <p className="muted">
        <Link href={`/login?next=${encodeURIComponent("/collection")}`}>Entre</Link> na sua conta para ver e editar a coleção.
      </p>
    );
  }

  // A coleção vem inteira da API (até 5000 cartas); mostramos 60 por página e buscamos só os dados dessas cartas.
  const items = [...res.data].sort((a, b) => a.cardId - b.cardId);
  const copies = items.reduce((sum, i) => sum + i.quantity, 0);
  const { page: rawPage } = await searchParams;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(rawPage) || 1));
  const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cards = slice.length
    ? (await api.GET("/cards", { params: { query: { ids: slice.map((i) => i.cardId), limit: 100 } } })).data?.items ?? []
    : [];
  const byId = new Map(cards.map((c) => [c.id, c]));

  return (
    <>
      <p className="muted">
        {items.length} {items.length === 1 ? "carta distinta" : "cartas distintas"} · {copies} {copies === 1 ? "cópia" : "cópias"}
      </p>
      {items.length === 0 ? (
        <p className="muted">
          Sua coleção está vazia. Abra uma carta no <Link href="/">catálogo</Link> e use os botões + para registrar suas cópias.
        </p>
      ) : (
        <ul className="card-grid">
          {slice.map((item) => {
            const card = byId.get(item.cardId);
            return (
              <li key={item.cardId}>
                <Link href={`/cards/${item.cardId}`}>
                  <span className="thumb">
                    {card ? <Image src={card.imageSmallUrl} alt={card.name} width={118} height={172} unoptimized /> : null}
                    {card ? <LimitBadge maxCopies={card.maxCopies} /> : null}
                  </span>
                  {card?.name ?? `Carta ${item.cardId}`}
                </Link>
                <QtyForms cardId={item.cardId} quantity={item.quantity} />
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 ? (
        <div className="pager">
          {page > 1 ? (
            <Link href={withQuery("/collection", { page: page > 2 ? String(page - 1) : undefined })} className="button ghost">
              ← Anterior
            </Link>
          ) : null}
          <Pager nextHref={page < pages ? withQuery("/collection", { page: String(page + 1) }) : null} />
        </div>
      ) : null}
    </>
  );
}