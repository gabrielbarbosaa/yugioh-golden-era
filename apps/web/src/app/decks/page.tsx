import { Suspense } from "react";

import { DeckList } from "@/components/deck-list";
import { Pager, withQuery } from "@/components/pager";
import { api, describeError } from "@/lib/api";

type SearchParams = Promise<{ q?: string; sort?: string; cursor?: string }>;

export const metadata = { title: "Decks" };

export default function DecksPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1>Decks da comunidade</h1>
      <Suspense fallback={<p className="skeleton">Carregando decks…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { q, cursor, sort: rawSort } = await searchParams;
  const sort = rawSort === "recent" ? "recent" : "popular";
  const { data, error } = await api.GET("/decks", {
    params: { query: { sort, q: q || undefined, cursor: cursor || undefined, limit: 20 } },
  });
  if (!data) throw new Error(describeError(error));

  return (
    <>
      <form className="search" action="/decks">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar deck por nome" aria-label="Buscar decks" />
        <select name="sort" defaultValue={sort} aria-label="Ordenação">
          <option value="popular">Mais curtidos</option>
          <option value="recent">Mais recentes</option>
        </select>
        <button className="button" type="submit">
          Buscar
        </button>
      </form>
      {data.items.length === 0 ? (
        <p className="muted">Ainda não há decks públicos. Os decks publicados pela comunidade aparecem aqui.</p>
      ) : (
        <DeckList decks={data.items} />
      )}
      <Pager nextHref={data.nextCursor ? withQuery("/decks", { q, sort, cursor: data.nextCursor }) : null} />
    </>
  );
}
