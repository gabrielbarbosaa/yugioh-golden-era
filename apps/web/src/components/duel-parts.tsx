"use client";

import { useState } from "react";
import type { Action, CardInfo, DeckReport, GameView, Position, SupportInfo } from "@golden-era/duel-engine";

export const POSITION_NAMES = { attack: "ataque", defense: "defesa", facedown: "defesa virada", setattack: "ataque virado" } as const;

export const STAR_NAMES: Record<string, string> = {
  sun: "Sol",
  moon: "Lua",
  venus: "Vênus",
  mercury: "Mercúrio",
  mars: "Marte",
  jupiter: "Júpiter",
  saturn: "Saturno",
  uranus: "Urano",
  pluto: "Plutão",
  neptune: "Netuno",
};

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
  kind: "spell" | "trap" | "effect" | "revive" | "flip" | "fusion";
  /** Só na fusão: as cartas que se juntam (o `id` é o resultado). */
  materials?: number[];
}

/** Quanto tempo (ms) cada anúncio fica na tela. */
export const REVEAL_MS: Record<Reveal["kind"], number> = { spell: 2600, trap: 2600, effect: 2600, revive: 2600, flip: 1400, fusion: 3800 };

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
  if (reveal.kind === "fusion") return <FusionOverlay reveal={reveal} imageBase={imageBase} />;
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
/**
 * Animação de fusão, no estilo do Forbidden Memories do PS1: as cartas-material vêm para o centro, giram dentro de um
 * redemoinho de luz, um clarão branco toma a tela e o monstro resultante surge no meio de raios dourados.
 */
function FusionOverlay({ reveal, imageBase }: { reveal: Reveal; imageBase: string }) {
  const mats = reveal.materials ?? [];
  return (
    <div className="duel-fusion" key={reveal.key} role="status" aria-label={`${reveal.title} ${reveal.name}`}>
      <div className="duel-fusion-vortex" />
      <div className="duel-fusion-mats">
        {mats.map((id, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} className="duel-fusion-mat" style={{ ["--dx" as string]: `${(i - (mats.length - 1) / 2) * 190}px`, ["--d" as string]: `${i * 0.12}s` }} src={`${imageBase}/cards/${id}.jpg`} alt="" width={150} />
        ))}
      </div>
      <div className="duel-fusion-flash" />
      <div className="duel-fusion-rays" />
      <div className="duel-fusion-result">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${imageBase}/cards/${reveal.id}.jpg`} alt={reveal.name} width={230} />
        <h3>{reveal.name}</h3>
        {reveal.text ? <p>{reveal.text}</p> : null}
      </div>
      <p className="duel-fusion-title">{reveal.title}</p>
    </div>
  );
}

type PlayAct = Extract<Action, { type: "play" }>;

const POSITION_HELP: Record<Position, string> = {
  attack: "Em pé, aberta. Pode atacar a partir do próximo turno.",
  defense: "De lado, aberta. Defende com a DEF e não ataca.",
  facedown: "De lado, virada para baixo. O oponente não vê a carta até ela ser atacada.",
  setattack: "Em pé, virada para baixo. Pode atacar a partir do próximo turno; é revelada ao atacar ou ao ser atacada.",
};

/**
 * Painel de invocação: com a carta (ou a fusão) já escolhida na mão, o jogador decide como colocá-la: posição
 * (ataque, defesa ou defesa virada para baixo), estrela ativa e, se a fusão tiver mais de um resultado, qual deles.
 * `plays` são as jogadas legais que usam exatamente as cartas selecionadas.
 */
export function SummonPanel({
  plays,
  hand,
  match,
  imageBase,
  sacrificeName,
  onAct,
  onCancel,
}: {
  plays: PlayAct[];
  hand: number[];
  match: Match;
  imageBase: string;
  sacrificeName: string | null;
  onAct: (a: Action) => void;
  onCancel: () => void;
}) {
  const first = plays[0]!;
  const [position, setPosition] = useState<Position>(first.position);
  const [star, setStar] = useState<0 | 1>(first.star);
  const [result, setResult] = useState<number | undefined>(first.result);

  const positions = (["attack", "setattack", "defense", "facedown"] as const).filter((p) => plays.some((a) => a.position === p));
  const stars = ([0, 1] as const).filter((s) => plays.some((a) => a.star === s));
  const results = [...new Set(plays.map((a) => a.result).filter((r): r is number => r !== undefined))];
  const chosen = plays.find((a) => a.position === position && a.star === star && a.result === result) ?? plays.find((a) => a.position === position) ?? first;

  const fusion = first.hand.length > 1;
  const materials = first.hand.map((i) => hand[i]!);
  // Com uma carta só sabemos qual é; numa fusão só quando a jogada diz o resultado.
  const previewId = fusion ? (chosen.result ?? null) : (materials[0] ?? null);
  const info = previewId !== null ? match.cards[previewId] : undefined;
  const name = (id: number) => match.cards[id]?.name ?? `#${id}`;
  const art = (id: number) => `${imageBase}/cards_small/${id}.jpg`;
  const starName = (s: 0 | 1) => {
    const k = info?.stars[s];
    return k ? STAR_NAMES[k] : `Estrela ${s + 1}`;
  };

  return (
    <div className="duel-summon" role="group" aria-label="Invocar monstro">
      <div className="duel-summon-head">
        <strong>{fusion ? `Fundir ${materials.map(name).join(" + ")}` : `Invocar ${name(materials[0]!)}`}</strong>
        {info ? <span className="muted">ATK {info.atk} / DEF {info.def}</span> : fusion ? <span className="muted">o resultado depende da receita</span> : null}
      </div>

      {results.length > 1 ? (
        <div className="duel-summon-block">
          <span className="duel-summon-label">Qual fusão?</span>
          <div className="duel-choices">
            {results.map((r) => (
              <button key={r} type="button" aria-pressed={result === r} className={`duel-choice ${result === r ? "on" : ""}`} onClick={() => setResult(r)}>
                <span className="duel-choice-art">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={art(r)} alt={name(r)} width={118} height={172} />
                </span>
                <span className="duel-choice-name">{name(r)}</span>
                <span className="duel-choice-stats">ATK {match.cards[r]?.atk} / DEF {match.cards[r]?.def}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="duel-summon-block">
        <span className="duel-summon-label">Como colocar a carta</span>
        <div className="duel-summon-options" role="radiogroup" aria-label="Posição">
          {positions.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={position === p} className={`duel-summon-opt ${position === p ? "on" : ""}`} onClick={() => setPosition(p)}>
              <span className={`duel-pos-art pos-${p}`}>
                {p === "facedown" || p === "setattack" || previewId === null ? (
                  <span className="duel-back" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={art(previewId)} alt="" width={118} height={172} />
                )}
              </span>
              <strong>{p === "attack" ? "Ataque" : p === "defense" ? "Defesa" : p === "facedown" ? "Defesa virada" : "Ataque virado"}</strong>
              <span className="muted">{POSITION_HELP[p]}</span>
            </button>
          ))}
        </div>
      </div>

      {stars.length > 1 ? (
        <div className="duel-summon-block">
          <span className="duel-summon-label">Estrela de guarda (vantagem só na batalha)</span>
          <div className="duel-summon-stars" role="radiogroup" aria-label="Estrela">
            {stars.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={star === s} className={`duel-star ${star === s ? "on" : ""}`} onClick={() => setStar(s)}>
                ★ {starName(s)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sacrificeName ? <p className="muted duel-hint">Campo cheio: {sacrificeName} será sacrificado para dar lugar à carta.</p> : null}

      <div className="duel-actions">
        <button className="button" onClick={() => onAct(chosen)}>
          {fusion ? "Fundir" : "Invocar"} em {POSITION_NAMES[position]}
        </button>
        <button className="button ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}