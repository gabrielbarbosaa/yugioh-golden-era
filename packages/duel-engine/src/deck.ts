import { shuffle } from "./rng.ts";
import type { Rules } from "./types.ts";

/** Uma linha de deck da conta (ids de carta do catálogo e quantidades). */
export interface DeckEntry {
  cardId: number;
  quantity: number;
}

/** O que aconteceu na conversão, para mostrar ao jogador. */
export interface DeckReport {
  /** Monstros do deck da conta que entraram no baralho do duelo. */
  used: number;
  /** Cartas do deck que ficaram de fora (magias, armadilhas, fusões ou monstros fora do modo, e o excedente de 40). */
  ignored: number;
  /** Monstros sorteados para completar as 40 cartas. */
  filled: number;
}

/**
 * Converte um deck da conta num baralho válido do duelo (REGRA DA CASA: o modo tem monstros e um conjunto pequeno de
 * magias e armadilhas com efeito). Entram, na ordem do deck, as cartas que o modo conhece (no máximo 3 cópias e 40 cartas);
 * o resto das cartas é ignorado, e se faltar para chegar a `rules.deckSize` o baralho é completado com monstros
 * sorteados (determinístico pela semente). Sempre devolve um baralho válido.
 */
export function buildDeck(rules: Rules, entries: readonly DeckEntry[], seed: number): { deck: number[]; report: DeckReport } {
  const deck: number[] = [];
  const copies = new Map<number, number>();
  let total = 0;
  for (const e of entries) {
    total += Math.max(0, e.quantity);
    const card = rules.cards[e.cardId];
    if ((!card && !rules.support[e.cardId]) || card?.fusion) continue;
    for (let k = 0; k < e.quantity; k++) {
      const have = copies.get(e.cardId) ?? 0;
      if (have >= 3 || deck.length >= rules.deckSize) break;
      copies.set(e.cardId, have + 1);
      deck.push(e.cardId);
    }
  }
  const used = deck.length;

  let filled = 0;
  if (deck.length < rules.deckSize) {
    const pool = Object.values(rules.cards)
      .filter((c) => !c.fusion)
      .map((c) => c.id)
      .sort((a, b) => a - b); // ordem fixa antes de embaralhar: a semente decide tudo
    let rng = seed >>> 0;
    const shuffled = shuffle(pool, rng);
    rng = shuffled.state;
    for (const id of shuffled.items) {
      if (deck.length >= rules.deckSize) break;
      const have = copies.get(id) ?? 0;
      if (have >= 3) continue;
      const r = shuffle([1, 2, 3], rng);
      rng = r.state;
      const add = Math.min(r.items[0]!, 3 - have, rules.deckSize - deck.length);
      for (let k = 0; k < add; k++) deck.push(id);
      copies.set(id, have + add);
      filled += add;
    }
  }
  return { deck, report: { used, ignored: Math.max(0, total - used), filled } };
}