import Link from "next/link";
import { Suspense } from "react";

import { CardGrid } from "@/components/card-grid";
import { LimitBadge } from "@/components/limit-badge";
import { PageBanner } from "@/components/page-banner";
import { api, describeError } from "@/lib/api";
import { banlistLabel } from "@/lib/banlist";

export const metadata = { title: "Lista da era" };

export default function BanlistPage() {
  return (
    <>
      <PageBanner title="Cartas proibidas e limitadas" artCardId={33396948} side="left">
        A lista oficial do OCG em vigor ao fim da era Duel Monsters.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando lista…</p>}>
        <Banlist />
      </Suspense>
    </>
  );
}

const RULE = ["não podem entrar no deck", "no máximo 1 cópia", "no máximo 2 cópias"];

async function Banlist() {
  const { data, error } = await api.GET("/banlist");
  if (!data) throw new Error(describeError(error));

  // Os dados completos das cartas (imagem, etc.) vêm em uma chamada por grupo (a API aceita até 100 ids).
  const groups = await Promise.all(
    [0, 1, 2].map(async (max) => {
      const entries = data.cards.filter((c) => c.maxCopies === max);
      const ids = entries.map((c) => c.cardId);
      const page = ids.length ? await api.GET("/cards", { params: { query: { ids, limit: 100 } } }) : null;
      return { max, label: banlistLabel(max)!, entries, cards: page?.data?.items ?? [] };
    }),
  );

  return (
    <>
      <p className="muted">
        {data.name} · em vigor desde {data.effectiveFrom} · fonte: {data.source}. Vale para o deck inteiro (principal, Extra e
        Side somados). As demais cartas podem ter até 3 cópias.
      </p>
      {groups.map((g) => (
        <section key={g.max}>
          <h2 className="ban-heading">
            <LimitBadge maxCopies={g.max} />
            <span>
              {g.label}s · {g.entries.length} <span className="muted">({RULE[g.max]})</span>
            </span>
          </h2>
          {g.entries.length === 0 ? (
            <p className="muted">Nenhuma carta.</p>
          ) : g.cards.length > 0 ? (
            <CardGrid cards={g.cards} />
          ) : (
            // Sem os dados das cartas (falha parcial), a lista de nomes ainda é útil.
            <ul className="plain-list">
              {g.entries.map((c) => (
                <li key={c.cardId}>
                  <Link href={`/cards/${c.cardId}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}