import { Suspense } from "react";

import { PageBanner } from "@/components/page-banner";
import { Pager, withQuery } from "@/components/pager";
import { UserList } from "@/components/user-list";
import { api, describeError } from "@/lib/api";

export const metadata = { title: "Jogadores" };

type SearchParams = Promise<{ q?: string; cursor?: string }>;

export default function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageBanner title="Jogadores" artCardId={46986414}>
        Procure outros duelistas pelo nome de usuário, abra o perfil e siga para acompanhá-los.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando…</p>}>
        <Search searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Search({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", cursor } = await searchParams;
  const text = q.trim().slice(0, 24);

  let results: React.ReactNode = <p className="muted">Digite um nome (ou parte dele) para buscar.</p>;
  if (text) {
    const res = await api.GET("/users", { params: { query: { q: text, cursor: cursor || undefined, limit: 30 } } });
    if (!res.data) throw new Error(describeError(res.error));
    results = (
      <>
        <UserList users={res.data.items} empty={`Nenhum jogador encontrado para "${text}".`} />
        <Pager nextHref={res.data.nextCursor ? withQuery("/players", { q: text, cursor: res.data.nextCursor }) : null} />
      </>
    );
  }

  return (
    <>
      <form action="/players" className="players-search" role="search">
        <label className="sr-only" htmlFor="players-q">Nome do jogador</label>
        <input id="players-q" name="q" defaultValue={text} placeholder="Buscar jogador pelo nome" maxLength={24} autoComplete="off" />
        <button className="button">Buscar</button>
      </form>
      {results}
    </>
  );
}