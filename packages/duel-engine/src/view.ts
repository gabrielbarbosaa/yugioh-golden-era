import { shuffle } from "./rng.ts";
import type { Choice, FieldRef, GameEvent, GameState, PlayerIndex, Position, Rules, Star } from "./types.ts";

/** Um monstro como o jogador o enxerga: o oponente não vê a carta virada para baixo. */
export interface MonsterView {
  /** `null` = escondida (monstro virado do oponente). */
  cardId: number | null;
  position: Position;
  star: Star | null;
  summonedOn: number;
  attackedOn: number;
  movedOn: number;
}

/** Uma zona de armadilha: o oponente só vê que há uma carta virada (`cardId` nulo). */
export interface TrapView {
  cardId: number | null;
}

export interface PlayerView {
  lp: number;
  deckCount: number;
  handCount: number;
  /** A mão só aparece para o dono; para o oponente é `null` (só a contagem). */
  hand: number[] | null;
  field: (MonsterView | null)[];
  traps: (TrapView | null)[];
  graveyard: number[];
}

/** Resposta ou escolha em andamento. As opções de uma escolha só aparecem para quem escolhe. */
export type PendingView =
  | { type: "respond"; player: PlayerIndex; attacker: FieldRef; target: number | "direct" }
  | { type: "choose"; player: PlayerIndex; effect: string; options: Choice[] | null };

/** O que um jogador pode saber do estado. Nunca vaza a mão nem a ordem do baralho do oponente, nem a semente. */
export interface GameView {
  you: PlayerIndex;
  turn: number;
  current: PlayerIndex;
  /** Quem pode agir agora: igual a `current`, exceto durante uma resposta ou escolha pendente. */
  actor: PlayerIndex;
  played: boolean;
  spellUsed: boolean;
  pending: PendingView | null;
  /** Indexado pelo assento (0 ou 1), o mesmo de `you` e `current`. */
  players: [PlayerView, PlayerView];
  winner: PlayerIndex | "draw" | null;
  reason: string | null;
}

export function viewFor(state: GameState, viewer: PlayerIndex): GameView {
  const view = (i: PlayerIndex): PlayerView => {
    const p = state.players[i];
    const mine = i === viewer;
    return {
      lp: p.lp,
      deckCount: p.deck.length,
      handCount: p.hand.length,
      hand: mine ? [...p.hand] : null,
      field: p.field.map((m) => {
        if (!m) return null;
        const hidden = !mine && (m.position === "facedown" || m.position === "setattack");
        return {
          cardId: hidden ? null : m.cardId,
          position: m.position,
          star: hidden ? null : m.star,
          summonedOn: m.summonedOn,
          attackedOn: m.attackedOn,
          movedOn: m.movedOn,
        };
      }),
      traps: p.traps.map((id) => (id === null ? null : { cardId: mine ? id : null })),
      graveyard: [...p.graveyard],
    };
  };
  const pend = state.pending;
  return {
    you: viewer,
    turn: state.turn,
    current: state.current,
    actor: pend ? pend.player : state.current,
    played: state.played,
    spellUsed: state.spellUsed,
    pending: !pend ? null : pend.type === "respond" ? pend : { type: "choose", player: pend.player, effect: pend.effect, options: pend.player === viewer ? pend.options : null },
    players: [view(0), view(1)],
    winner: state.winner,
    reason: state.reason,
  };
}

/** Quantas magias/armadilhas entram num baralho aleatório. */
const RANDOM_SUPPORT = 6;

/**
 * Baralho aleatório válido (40 cartas, até 3 cópias, só monstros de baralho), determinístico pela semente.
 * Serve para o "duelo rápido" enquanto não existe um editor de baralhos do modo.
 */
export function randomDeck(rules: Rules, seed: number): number[] {
  const ids = Object.values(rules.cards)
    .filter((c) => !c.fusion)
    .map((c) => c.id)
    .sort((a, b) => a - b); // ordem fixa antes de embaralhar: a semente decide tudo
  const { items, state } = shuffle(ids, seed >>> 0);
  const deck: number[] = [];
  let rng = state;

  // Algumas magias e armadilhas (até RANDOM_SUPPORT cartas), para o baralho aleatório mostrar o que o modo tem.
  const support = Object.values(rules.support).map((s) => s.id).sort((a, b) => a - b);
  const sup = shuffle(support, rng);
  rng = sup.state;
  for (const id of sup.items) {
    if (deck.length >= Math.min(RANDOM_SUPPORT, rules.deckSize)) break;
    const r = shuffle([1, 2], rng);
    rng = r.state;
    const copies = Math.min(r.items[0]!, Math.min(RANDOM_SUPPORT, rules.deckSize) - deck.length);
    for (let k = 0; k < copies; k++) deck.push(id);
  }

  for (const id of items) {
    if (deck.length >= rules.deckSize) break;
    const r = shuffle([1, 2, 3], rng);
    rng = r.state;
    const copies = Math.min(r.items[0]!, rules.deckSize - deck.length);
    for (let k = 0; k < copies; k++) deck.push(id);
  }
  return deck;
}

/** Id usado nos eventos no lugar de uma carta que o jogador não pode ver. */
export const HIDDEN_CARD = -1;

/**
 * Eventos como o jogador pode vê-los: as compras do oponente e as jogadas dele viradas para baixo
 * (incluindo os materiais de uma fusão feita virada) não revelam a carta.
 */
export function eventsFor(events: readonly GameEvent[], viewer: PlayerIndex): GameEvent[] {
  return events.map((e) => {
    if ("player" in e && e.player !== viewer) {
      if (e.type === "draw") return { ...e, cardId: HIDDEN_CARD };
      if (e.type === "set") return { ...e, cardId: HIDDEN_CARD };
      if (e.type === "play" && (e.position === "facedown" || e.position === "setattack")) return { ...e, cardId: HIDDEN_CARD, star: null, materials: [] };
    }
    return e;
  });
}