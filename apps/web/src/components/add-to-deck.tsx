"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { addCardToDeck } from "@/app/actions";

export interface DeckOption {
  id: string;
  name: string;
  visibility: "public" | "private";
}

/** Caixa "Adicionar a um baralho" da página da carta: escolhe um dos decks da conta e soma uma cópia. */
export function AddToDeck({ cardId, decks }: { cardId: number; decks: DeckOption[] }) {
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; deckId: string } | null>(null);

  if (decks.length === 0) {
    return (
      <div className="owned-box add-deck">
        <strong>Adicionar a um baralho</strong>
        <p className="muted">
          Você ainda não tem decks. <Link href="/decks/new">Monte o primeiro</Link>.
        </p>
      </div>
    );
  }

  function add() {
    const target = deckId;
    start(async () => {
      const res = await addCardToDeck(target, cardId);
      setResult({ ok: res.ok, text: res.ok ? res.message : res.error, deckId: target });
    });
  }

  return (
    <div className="owned-box add-deck">
      <strong>Adicionar a um baralho</strong>
      <div className="add-deck-row">
        <label className="sr-only" htmlFor="add-deck-select">Baralho</label>
        <select id="add-deck-select" value={deckId} onChange={(e) => { setDeckId(e.target.value); setResult(null); }} disabled={pending}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.visibility === "private" ? " (privado)" : ""}
            </option>
          ))}
        </select>
        <button type="button" className="button" onClick={add} disabled={pending || !deckId}>
          {pending ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
      <p className={`add-deck-msg ${result ? (result.ok ? "ok" : "bad") : ""}`} role="status" aria-live="polite">
        {result ? result.text : ""}
        {result?.ok ? (
          <>
            {" "}
            <Link href={`/decks/${result.deckId}`}>Ver o deck</Link> · <Link href={`/decks/${result.deckId}/edit`}>Editar</Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Versão para quem não entrou: um convite para entrar. */
export function AddToDeckLogin({ cardId }: { cardId: number }) {
  return (
    <p className="muted">
      <Link href={`/login?next=${encodeURIComponent(`/cards/${cardId}`)}`}>Entre</Link> para adicionar esta carta a um dos seus baralhos.
    </p>
  );
}
