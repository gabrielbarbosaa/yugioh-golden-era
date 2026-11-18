"use client";

import type { Action, CardInfo, DeckReport, GameView, SupportInfo } from "@golden-era/duel-engine";

export const POSITION_NAMES = { attack: "ataque", defense: "defesa", facedown: "virada" } as const;

export const CHOOSE_TITLES: Record<string, string> = {
  monsterReborn: "Monster Reborn: escolha qual monstro trazer de volta ao seu campo",
  manEaterBug: "Man-Eater Bug: escolha o monstro que será destruído",
  haneHane: "Hane-Hane: escolha o monstro que volta para a mão do dono",
};
export interface Match {
  room: string;
  you: 0 | 1;
  opponent: string;
  cards: Record<number, CardInfo>;
  support: Record<number, SupportInfo>;
  deck?: { name: string } & DeckReport;
}

/** Carta que o jogo anuncia no meio da mesa (magia, armadilha, efeito...). */
export interface Reveal {
  key: number;
  id: number;
  title: string;
  name: string;
  text: string;
  kind: "spell" | "trap" | "effect" | "revive" | "flip";
}

/** Dados de uma carta (monstro ou magia/armadilha) para mostrar no inspetor e nos anúncios. */
export interface Facts {
  id: number;
  name: string;
  kind: string;
  stats: string | null;
  text: string | null;
}

export function factsOf(m: Match, id: number): Facts {
  const s = m.support[id];
  if (s) return { id, name: s.name, kind: s.kind === "spell" ? "Magia" : "Armadilha", stats: null, text: s.effect };
  const c = m.cards[id];
  if (!c) return { id, name: `#${id}`, kind: "Carta", stats: null, text: null };
  const bits = [`ATK ${c.atk} / DEF ${c.def}`, `Nível ${c.level}`, c.attribute, c.race].filter(Boolean);
  return { id, name: c.name, kind: c.fusion ? "Monstro de fusão" : "Monstro", stats: bits.join(" · "), text: c.effect ?? null };
}

/** Carta clicável (com nome, números e dono) usada nas respostas e escolhas pendentes. */
export function FaceCard({
  facts,
  src,
  label,
  extra,
  onClick,
  onInspect,
}: {
  facts: Facts | null;
  src: string | null;
  label: string;
  extra?: string;
  onClick: () => void;
  onInspect?: () => void;
}) {
  return (
    <button type="button" className="duel-choice" onClick={onClick} onMouseEnter={onInspect} onFocus={onInspect}>
      <span className="duel-choice-art">
        {src && facts ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={facts.name} width={118} height={172} />
        ) : (
          <span className="duel-back" />
        )}
      </span>
      <span className="duel-choice-name">{facts ? facts.name : "Monstro virado"}</span>
      {facts?.stats ? <span className="duel-choice-stats">{facts.stats.split(" · ")[0]}</span> : null}
      <span className="duel-choice-owner">{label}</span>
      {extra ? <span className="duel-choice-owner">{extra}</span> : null}
    </button>
  );
}

/**
 * Resposta ou escolha pendente, com as cartas à vista: reagir a um ataque (armadilha virada ou Kuriboh) ou escolher o
 * alvo de um efeito (Monster Reborn mostra o cemitério; Man-Eater Bug e Hane-Hane, os monstros em campo).
 */
export function PendingPanel({
  view,
  match,
  legal,
  imageBase,
  onAct,
  onInspect,
}: {
  view: GameView;
  match: Match;
  legal: Action[];
  imageBase: string;
  onAct: (a: Action) => void;
  onInspect: (id: number) => void;
}) {
  const pend = view.pending;
  if (!pend || view.actor !== match.you || view.winner !== null) return null;
  const me = view.players[match.you];
  const hand = me.hand ?? [];
  const art = (id: number) => `${imageBase}/cards_small/${id}.jpg`;
  const face = (id: number | null, label: string, onClick: () => void, key: number, extra?: string) => (
    <FaceCard
      key={key}
      facts={id === null ? null : factsOf(match, id)}
      src={id === null ? null : art(id)}
      label={label}
      extra={extra}
      onClick={onClick}
      onInspect={id === null ? undefined : () => onInspect(id)}
    />
  );

  let heading;
  if (pend.type === "respond") {
    const atk = view.players[pend.attacker.side].field[pend.attacker.zone];
    const atkCard = atk?.cardId != null ? match.cards[atk.cardId] : null;
    heading = (
      <p>
        {match.opponent} ataca com <strong>{atk?.cardId != null ? factsOf(match, atk.cardId).name : "um monstro"}</strong>
        {atkCard ? ` (ATK ${atkCard.atk})` : ""} {pend.target === "direct" ? "direto nos seus pontos de vida" : `o seu monstro da zona ${pend.target + 1}`}. Quer responder?
      </p>
    );
  } else {
    heading = <p>{CHOOSE_TITLES[pend.effect] ?? "Escolha o alvo do efeito"}</p>;
  }

  return (
    <div className="duel-pending">
      {heading}
      <div className="duel-choices">
        {pend.type === "respond"
          ? legal.map((a, i) => {
              if (a.type === "pass") {
                return (
                  <button key={i} className="button ghost" onClick={() => onAct(a)}>
                    Deixar o ataque passar
                  </button>
                );
              }
              if (a.type !== "respond") return null;
              const id = a.from === "trap" ? (me.traps[a.index]?.cardId ?? null) : (hand[a.index] ?? null);
              return face(id, a.from === "trap" ? "Ativar armadilha" : "Descartar da mão", () => onAct(a), i);
            })
          : pend.options?.map((o, index) => {
              if (o.kind === "grave") {
                const id = view.players[o.side].graveyard[o.index] ?? null;
                return face(id, o.side === match.you ? "Seu cemitério" : "Cemitério do oponente", () => onAct({ type: "choose", index }), index);
              }
              const m = view.players[o.side].field[o.zone];
              return face(
                m?.cardId ?? null,
                `${o.side === match.you ? "Seu" : "Do oponente"} · zona ${o.zone + 1}`,
                () => onAct({ type: "choose", index }),
                index,
                m ? POSITION_NAMES[m.position] : undefined,
              );
            })}
      </div>
    </div>
  );
}

/** Anúncio da carta usada (magia, armadilha, efeito...), grande, no meio da tela, para os dois jogadores. */
export function RevealOverlay({ reveal, imageBase }: { reveal: Reveal; imageBase: string }) {
  return (
    <div className={`duel-reveal ${reveal.kind}`} key={reveal.key} role="status">
      <div className="duel-reveal-card">
        <p className="duel-reveal-title">{reveal.title}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${imageBase}/cards/${reveal.id}.jpg`} alt={reveal.name} width={240} />
        <h3>{reveal.name}</h3>
        {reveal.text ? <p>{reveal.text}</p> : null}
      </div>
    </div>
  );
}