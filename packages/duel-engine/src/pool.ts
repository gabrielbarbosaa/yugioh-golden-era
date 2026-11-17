import { assignStars } from "./stars.ts";
import type { Card, Recipe, Rules } from "./types.ts";

/** Formato do arquivo `data/fm-pool.json` (gerado por `scripts/build-pool.ts`). Estrelas e custo são derivados ao carregar. */
export interface PoolData {
  cards: {
    id: number;
    name: string;
    fusion: boolean;
    atk: number;
    def: number;
    level: number;
    attribute: string | null;
    race: string | null;
  }[];
  recipes: Recipe[];
}

export const DEFAULT_SETTINGS = {
  startingLp: 8000,
  handSize: 5,
  fieldSize: 5,
  deckSize: 40,
  maxTurns: 80,
  starBonus: 500,
} as const;

/**
 * Custo de baralho (REGRA DA CASA): cresce com o nível e com o maior atributo de combate, para que os monstros
 * fortes (que, sem tributo, seriam simplesmente os melhores) ocupem mais do orçamento do baralho.
 */
export function cardCost(c: { atk: number; def: number; level: number }): number {
  return 1 + c.level + Math.floor(Math.max(c.atk, c.def) / 400);
}

export const recipeKey = (ids: readonly number[]): string => [...ids].sort((a, b) => a - b).join(",");

export function buildRules(data: PoolData, overrides: Partial<Omit<Rules, "cards" | "recipes" | "recipeIndex">> = {}): Rules {
  const cards: Record<number, Card> = {};
  for (const c of data.cards) {
    cards[c.id] = { ...c, stars: assignStars(c.id, c.attribute), cost: cardCost(c) };
  }
  const recipeIndex: Record<string, number[]> = {};
  for (const r of data.recipes) {
    const key = recipeKey(r.materials);
    const list = (recipeIndex[key] ??= []);
    if (!list.includes(r.result)) list.push(r.result);
  }
  return { cards, recipes: data.recipes, recipeIndex, ...DEFAULT_SETTINGS, ...overrides };
}

/**
 * Todas as cartas que a combinação (ids, nesta ordem) pode gerar:
 * - uma carta só: ela mesma;
 * - uma receita que use exatamente esse conjunto (ex.: 3 Blue-Eyes White Dragon);
 * - ou a fusão em cadeia, par a par (A+B vira X, X+C vira Y...).
 * Vazio se a combinação não existe. Mais de um resultado só ocorre quando duas receitas usam os mesmos
 * materiais (ex.: Robolady + Roboyarou vira Super Robolady ou Super Roboyarou); aí o jogador escolhe.
 */
export function fusionOptions(rules: Rules, ids: readonly number[]): Card[] {
  if (ids.length === 0) return [];
  if (ids.length === 1) {
    const only = rules.cards[ids[0]!];
    return only ? [only] : [];
  }
  const found = new Set<number>(rules.recipeIndex[recipeKey(ids)] ?? []);

  let acc = new Set<number>([ids[0]!]);
  for (let i = 1; i < ids.length && acc.size > 0; i++) {
    const next = new Set<number>();
    for (const a of acc) for (const r of rules.recipeIndex[recipeKey([a, ids[i]!])] ?? []) next.add(r);
    acc = next;
  }
  for (const r of acc) found.add(r);

  return [...found].sort((a, b) => a - b).flatMap((id) => (rules.cards[id] ? [rules.cards[id]!] : []));
}

/**
 * Resultado de combinar as cartas, ou `null` se não existe (ou se é ambíguo e `result` não foi informado).
 * Com `result`, devolve essa carta se ela for uma das possibilidades.
 */
export function resolveFusion(rules: Rules, ids: readonly number[], result?: number): Card | null {
  const options = fusionOptions(rules, ids);
  if (result !== undefined) return options.find((c) => c.id === result) ?? null;
  return options.length === 1 ? options[0]! : null;
}

export function deckCost(rules: Rules, deck: readonly number[]): number {
  return deck.reduce((sum, id) => sum + (rules.cards[id]?.cost ?? 0), 0);
}

/** Problemas de um baralho (lista vazia = válido): 40 cartas, até 3 cópias, sem fusões, custo dentro do teto. */
export function validateDeck(rules: Rules, deck: readonly number[], costCap: number | null = null): string[] {
  const issues: string[] = [];
  if (deck.length !== rules.deckSize) issues.push(`o baralho precisa ter exatamente ${rules.deckSize} cartas (tem ${deck.length})`);
  const copies = new Map<number, number>();
  for (const id of deck) {
    const card = rules.cards[id];
    if (!card) {
      issues.push(`a carta ${id} não existe no catálogo do modo`);
      continue;
    }
    if (card.fusion) issues.push(`${card.name} é uma fusão e não pode ficar no baralho`);
    copies.set(id, (copies.get(id) ?? 0) + 1);
  }
  for (const [id, n] of copies) {
    if (n > 3) issues.push(`${rules.cards[id]?.name ?? id} aparece ${n} vezes (máximo 3)`);
  }
  if (costCap !== null) {
    const cost = deckCost(rules, deck);
    if (cost > costCap) issues.push(`o custo do baralho (${cost}) passa do teto (${costCap})`);
  }
  return issues;
}
