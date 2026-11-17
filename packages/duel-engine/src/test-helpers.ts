import { buildRules, type PoolData } from "./pool.ts";
import type { Card, GameState, MonsterOnField, PlayerIndex, Position, Rules, Star } from "./types.ts";

/** Cartas de teste com números redondos. IDs 1-9 são as "nomeadas"; 101-120 são enchimento para montar baralhos de 40. */
export function testRules(): Rules {
  const base = { attribute: "LIGHT", race: "Warrior", level: 4 };
  const cards: PoolData["cards"] = [
    { id: 1, name: "Fraco", fusion: false, atk: 1000, def: 800, ...base },
    { id: 2, name: "Médio", fusion: false, atk: 1800, def: 1200, ...base },
    { id: 3, name: "Forte", fusion: false, atk: 2500, def: 2000, ...base },
    { id: 4, name: "Muralha", fusion: false, atk: 500, def: 2300, ...base },
    { id: 5, name: "Dragão A", fusion: false, atk: 1500, def: 1000, ...base },
    { id: 6, name: "Dragão B", fusion: false, atk: 1400, def: 1100, ...base },
    { id: 7, name: "Fusão Dragão", fusion: true, atk: 2800, def: 2000, ...base },
    { id: 8, name: "Fusão Tripla", fusion: true, atk: 4500, def: 3800, ...base },
    { id: 9, name: "Fusão Cadeia", fusion: true, atk: 3300, def: 2500, ...base },
    { id: 10, name: "Fusão Gêmea A", fusion: true, atk: 2000, def: 1500, ...base },
    { id: 11, name: "Fusão Gêmea B", fusion: true, atk: 1500, def: 2100, ...base },
  ];
  for (let i = 101; i <= 120; i++) cards.push({ id: i, name: `Enchimento ${i}`, fusion: false, atk: 1000, def: 1000, ...base });
  return buildRules({
    cards,
    recipes: [
      { result: 7, materials: [5, 6] },
      { result: 8, materials: [5, 5, 5] },
      { result: 9, materials: [7, 3] },
      { result: 10, materials: [1, 2] },
      { result: 11, materials: [1, 2] },
    ],
  });
}

/** Força as estrelas de uma carta (as reais vêm de um hash do id). */
export function setStars(rules: Rules, id: number, stars: [Star, Star]) {
  rules.cards[id]!.stars = stars;
}

export function mon(rules: Rules, cardId: number, position: Position = "attack", star: 0 | 1 = 0, summonedOn = 0): MonsterOnField {
  const card = rules.cards[cardId] as Card;
  return { cardId, position, star: card.stars[star], summonedOn, attackedOn: 0, movedOn: 0 };
}

/** Estado montado à mão, para testar uma regra de cada vez. */
export function stateWith(
  rules: Rules,
  opts: {
    turn?: number;
    current?: PlayerIndex;
    hand?: [number[], number[]];
    deck?: [number[], number[]];
    field?: [(MonsterOnField | null)[], (MonsterOnField | null)[]];
    lp?: [number, number];
  } = {},
): GameState {
  const pad = (f: (MonsterOnField | null)[] = []) => [...f, ...Array.from({ length: rules.fieldSize - f.length }, () => null)];
  const player = (i: 0 | 1) => ({
    lp: opts.lp?.[i] ?? rules.startingLp,
    deck: [...(opts.deck?.[i] ?? [101, 102, 103, 104, 105, 106, 107, 108])],
    hand: [...(opts.hand?.[i] ?? [])],
    field: pad(opts.field?.[i]),
    graveyard: [],
  });
  return {
    turn: opts.turn ?? 2,
    current: opts.current ?? 0,
    played: false,
    players: [player(0), player(1)],
    rng: 1,
    winner: null,
    reason: null,
  };
}

/** Baralho de 40 cartas de enchimento (20 ids x 2 cópias). */
export const fillerDeck = (): number[] => Array.from({ length: 40 }, (_, i) => 101 + (i % 20));
