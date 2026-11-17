import { shuffle } from "./rng.ts";
import type { GameEvent, GameState, PlayerIndex, Position, Rules, Star } from "./types.ts";

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

export interface PlayerView {
  lp: number;
  deckCount: number;
  handCount: number;
  /** A mão só aparece para o dono; para o oponente é `null` (só a contagem). */
  hand: number[] | null;
  field: (MonsterView | null)[];
  graveyard: number[];
}

/** O que um jogador pode saber do estado. Nunca vaza a mão nem a ordem do baralho do oponente, nem a semente. */
export interface GameView {
  you: PlayerIndex;
  turn: number;
  current: PlayerIndex;
  played: boolean;
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
        const hidden = !mine && m.position === "facedown";
        return {
          cardId: hidden ? null : m.cardId,
          position: m.position,
          star: hidden ? null : m.star,
          summonedOn: m.summonedOn,
          attackedOn: m.attackedOn,
          movedOn: m.movedOn,
        };
      }),
      graveyard: [...p.graveyard],
    };
  };
  return {
    you: viewer,
    turn: state.turn,
    current: state.current,
    played: state.played,
    players: [view(0), view(1)],
    winner: state.winner,
    reason: state.reason,
  };
}

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
      if (e.type === "play" && e.position === "facedown") return { ...e, cardId: HIDDEN_CARD, star: null, materials: [] };
    }
    return e;
  });
}