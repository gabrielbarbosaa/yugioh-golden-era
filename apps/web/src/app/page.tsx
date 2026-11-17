import { Suspense } from "react";

import { CardGrid } from "@/components/card-grid";
import { Pager, withQuery } from "@/components/pager";
import { api, describeError } from "@/lib/api";

type SearchParams = Promise<{ q?: string; cursor?: string }>;

export default function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1>Cartas</h1>
      {/* searchParams só existe no pedido, então tudo que depende dele fica dentro do Suspense. */}
      <Suspense fallback={<p className="skeleton">Carregando cartas…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { q, cursor } = await searchParams;
  const { data, error } = await api.GET("/cards", {
    params: { query: { q: q || undefined, cursor: cursor || undefined, limit: 36 } },
  });
  if (!data) throw new Error(describeError(error));

  return (
    <>
      <form className="search" action="/">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nome (ex.: Dark Magician)" aria-label="Buscar cartas" />
        <button className="button" type="submit">
          Buscar
        </button>
      </form>
      {data.items.length === 0 ? <p className="muted">Nenhuma carta encontrada.</p> : <CardGrid cards={data.items} />}
      <Pager nextHref={data.nextCursor ? withQuery("/", { q, cursor: data.nextCursor }) : null} />
    </>
  );
}
