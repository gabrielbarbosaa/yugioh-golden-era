"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { deleteDeck, saveDeck, searchCards } from "@/app/actions";
import {
  addCard,
  banlistLabel,
  canAdd,
  homeZone,
  LIMITS,
  MIN_MAIN_PUBLIC,
  removeCard,
  ZONE_LABEL,
  ZONES,
  zoneCount,
  type CardLite,
  type DeckCards,
  type Zone,
} from "@/lib/deck-rules";

export type EditorInitial = {
  deckId: string | null;
  name: string;
  description: string;
  visibility: "private" | "public";
  cards: DeckCards;
  /** Dados das cartas que já estão no deck (o deck só guarda ids e quantidades). */
  known: CardLite[];
};

/** Editor de deck: nome, descrição, visibilidade, cartas por zona e busca. Salva pela Server Action `saveDeck`. */
export function DeckEditor({ initial }: { initial: EditorInitial }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [cards, setCards] = useState<DeckCards>(initial.cards);
  const [known, setKnown] = useState<Record<number, CardLite>>(() => Object.fromEntries(initial.known.map((c) => [c.id, c])));
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, startSave] = useTransition();
  const searchSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const main = zoneCount(cards, "main");

  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const seq = ++searchSeq.current;
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const found = await searchCards(value);
      if (seq !== searchSeq.current) return; // chegou uma busca mais nova
      setResults(found);
      setSearching(false);
    }, 300);
  }

  function add(card: CardLite, zone: Zone) {
    const why = canAdd(cards, zone, card);
    if (why) {
      setMessage({ text: why, ok: false });
      return;
    }
    setKnown((k) => ({ ...k, [card.id]: card }));
    setCards((c) => addCard(c, zone, card.id));
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startSave(async () => {
      // Em sucesso a ação redireciona para o deck; só voltamos aqui com erro.
      const res = await saveDeck(initial.deckId, { name, description, visibility, cards });
      if (res?.error) setMessage({ text: res.error, ok: false });
    });
  }

  function remove() {
    if (!initial.deckId || !window.confirm("Excluir este deck? Não dá para desfazer.")) return;
    startSave(async () => {
      await deleteDeck(initial.deckId!);
    });
  }

  return (
    <div className="deck-editor">
      <div className="editor-main">
        <div className="editor-fields">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nome do deck" />
          </label>
          <label>
            Descrição
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Descrição (opcional)" />
          </label>
          <fieldset className="visibility-toggle">
            <legend>Visibilidade</legend>
            {(["private", "public"] as const).map((v) => (
              <label key={v} className={visibility === v ? "on" : ""}>
                <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
                {v === "private" ? "Privado" : "Público"}
              </label>
            ))}
          </fieldset>
          {visibility === "public" && main < MIN_MAIN_PUBLIC ? (
            <p className="muted">
              Para publicar, o deck principal precisa ter pelo menos {MIN_MAIN_PUBLIC} cartas (tem {main}).
            </p>
          ) : null}
        </div>

        {ZONES.map((zone) => (
          <section key={zone}>
            <h2>
              {ZONE_LABEL[zone]} · {zoneCount(cards, zone)}/{LIMITS[zone]}
            </h2>
            {cards[zone].length === 0 ? (
              <p className="muted">Nenhuma carta.</p>
            ) : (
              <ul className="editor-rows">
                {cards[zone].map((e) => {
                  const card = known[e.cardId];
                  const label = card ? banlistLabel(card) : null;
                  return (
                    <li key={e.cardId} className="editor-row">
                      {card ? <Image src={card.imageSmallUrl} alt="" width={40} height={58} unoptimized /> : <span className="thumb-empty" />}
                      <Link href={`/cards/${e.cardId}`} className="editor-name">
                        {card?.name ?? `Carta ${e.cardId}`}
                        <span className="muted">
                          {card ? card.type : ""}
                          {label ? ` · ${label}` : ""}
                        </span>
                      </Link>
                      <button type="button" className="step-button" aria-label="Remover uma cópia" onClick={() => setCards((c) => removeCard(c, zone, e.cardId))}>
                        −
                      </button>
                      <span className="qty-box">{e.quantity}</span>
                      <button
                        type="button"
                        className="step-button"
                        aria-label="Adicionar uma cópia"
                        disabled={!card || canAdd(cards, zone, card) !== null}
                        title={card ? (canAdd(cards, zone, card) ?? undefined) : undefined}
                        onClick={() => card && add(card, zone)}
                      >
                        +
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        <div className="editor-actions">
          {message ? (
            <p role="alert" className={message.ok ? "ok" : "duel-error"}>
              {message.text}
            </p>
          ) : null}
          <button type="button" className="button" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar deck"}
          </button>
          <Link href={initial.deckId ? `/decks/${initial.deckId}` : "/"} className="button ghost">
            Cancelar
          </Link>
          {initial.deckId ? (
            <button type="button" className="linkbutton danger" onClick={remove} disabled={saving}>
              Excluir deck
            </button>
          ) : null}
        </div>
      </div>

      <aside className="editor-search">
        <h2>Adicionar cartas</h2>
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar pelo nome (mín. 2 letras)" aria-label="Buscar cartas" />
        {searching ? <p className="muted">Buscando…</p> : null}
        {!searching && query.trim().length >= 2 && results.length === 0 ? <p className="muted">Nenhuma carta encontrada.</p> : null}
        <ul className="editor-results">
          {results.map((card) => {
            const home = homeZone(card);
            const why = canAdd(cards, home, card);
            const sideWhy = canAdd(cards, "side", card);
            const label = banlistLabel(card);
            return (
              <li key={card.id} className="editor-row">
                <Image src={card.imageSmallUrl} alt="" width={40} height={58} unoptimized />
                <Link href={`/cards/${card.id}`} className="editor-name">
                  {card.name}
                  <span className="muted">
                    {card.type}
                    {label ? ` · ${label}` : ""}
                  </span>
                </Link>
                <button type="button" className="button small" disabled={why !== null} title={why ?? undefined} onClick={() => add(card, home)}>
                  + {home === "extra" ? "Extra" : "Principal"}
                </button>
                {!card.type.match(/fusion/i) ? (
                  <button type="button" className="button ghost small" disabled={sideWhy !== null} title={sideWhy ?? undefined} onClick={() => add(card, "side")}>
                    + Side
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}