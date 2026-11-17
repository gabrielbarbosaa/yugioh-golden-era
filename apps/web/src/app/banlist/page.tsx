import Link from "next/link";
import { Suspense } from "react";

import { api, describeError } from "@/lib/api";
import { banlistLabel } from "@/lib/banlist";

export const metadata = { title: "Lista da era" };

export default function BanlistPage() {
  return (
    <>
      <h1>Cartas proibidas e limitadas</h1>
      <Suspense fallback={<p className="skeleton">Carregando lista…</p>}>
        <Banlist />
      </Suspense>
    </>
  );
}

async function Banlist() {
  const { data, error } = await api.GET("/banlist");
  if (!data) throw new Error(describeError(error));

  // Da mais restritiva para a menos: proibidas, limitadas, semilimitadas.
  const groups = [0, 1, 2].map((max) => ({
    max,
    label: banlistLabel(max)!,
    cards: data.cards.filter((c) => c.maxCopies === max),
  }));
  const limit = (max: number) => (max === 0 ? "não podem entrar no deck" : max === 1 ? "no máximo 1 cópia" : "no máximo 2 cópias");

  return (
    <>
      <p className="muted">
        {data.name} · em vigor desde {data.effectiveFrom} · fonte: {data.source}. Vale para o deck inteiro (principal, Extra e
        Side somados). As demais cartas podem ter até 3 cópias.
      </p>
      {groups.map((g) => (
        <section key={g.max}>
          <h2>
            {g.label}s · {g.cards.length} <span className="muted">({limit(g.max)})</span>
          </h2>
          {g.cards.length === 0 ? (
            <p className="muted">Nenhuma carta.</p>
          ) : (
            <ul className="plain-list">
              {g.cards.map((c) => (
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