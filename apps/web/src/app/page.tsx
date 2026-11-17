import Link from "next/link";
import { Suspense } from "react";

import { CardGrid } from "@/components/card-grid";
import { Hero } from "@/components/hero";
import { Pager, withQuery } from "@/components/pager";
import { api, describeError } from "@/lib/api";

type SearchParams = Promise<{
  q?: string;
  type?: string;
  attribute?: string;
  race?: string;
  level?: string;
  archetype?: string;
  cursor?: string;
}>;

export default function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      {/* searchParams só existe no pedido, então tudo que depende dele fica dentro do Suspense. */}
      <Suspense fallback={<h1>Golden Era</h1>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Select de filtro; "Todos" (valor vazio) não filtra. */
function Filter({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label}>
      <option value="">{label}: todos</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { q, type, attribute, race, level, archetype, cursor } = await searchParams;
  const levelNumber = Number(level);
  const validLevel = Number.isInteger(levelNumber) && levelNumber >= 1 && levelNumber <= 12 ? levelNumber : undefined;

  const [cards, facets, archetypes] = await Promise.all([
    api.GET("/cards", {
      params: {
        query: {
          q: q || undefined,
          type: type || undefined,
          attribute: attribute || undefined,
          race: race || undefined,
          level: validLevel,
          archetype: archetype || undefined,
          cursor: cursor || undefined,
          limit: 36,
        },
      },
    }),
    api.GET("/cards/facets"),
    api.GET("/archetypes"),
  ]);
  if (!cards.data) throw new Error(describeError(cards.error));

  // Os filtros ficam na URL: a página é compartilhável e a paginação por cursor os preserva.
  const active = { q, type, attribute, race, level: validLevel ? String(validLevel) : undefined, archetype };
  const filtered = Object.values(active).some(Boolean);

  return (
    <>
      {!filtered && !cursor ? (
        <>
          <Hero />
          <h2 id="cartas">Todas as cartas</h2>
        </>
      ) : (
        <h1>{filtered ? "Resultados" : "Cartas"}</h1>
      )}
      <form className="search filters" action="/">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nome (ex.: Dark Magician)" aria-label="Buscar cartas" />
        <button className="button" type="submit">
          Buscar
        </button>
        <div className="filter-row">
          <Filter name="type" label="Tipo" value={type} options={facets.data?.types ?? []} />
          <Filter name="attribute" label="Atributo" value={attribute} options={facets.data?.attributes ?? []} />
          <Filter name="race" label="Espécie" value={race} options={facets.data?.races ?? []} />
          <Filter name="level" label="Nível" value={active.level} options={(facets.data?.levels ?? []).map(String)} />
          <Filter name="archetype" label="Arquétipo" value={archetype} options={archetypes.data ?? []} />
        </div>
      </form>
      {filtered ? (
        <p className="muted">
          Filtros ativos. <Link href="/">Limpar</Link>
        </p>
      ) : null}
      {cards.data.items.length === 0 ? <p className="muted">Nenhuma carta encontrada.</p> : <CardGrid cards={cards.data.items} />}
      <Pager nextHref={cards.data.nextCursor ? withQuery("/", { ...active, cursor: cards.data.nextCursor }) : null} />
    </>
  );
}