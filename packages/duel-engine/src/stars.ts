import type { Star } from "./types.ts";

/*
 * Estrelas guardiãs (REGRA DA CASA, inspirada no Forbidden Memories, mas não é a tabela do jogo original).
 *
 * Duas rodas independentes; cada estrela vence a seguinte da própria roda e perde para a anterior.
 * Entre rodas diferentes, e entre estrelas que não são vizinhas, ninguém tem vantagem.
 *   Roda A: sol > lua > vênus > mercúrio > sol
 *   Roda B: marte > júpiter > saturno > urano > plutão > netuno > marte
 */
const WHEEL_A: readonly Star[] = ["sun", "moon", "venus", "mercury"];
const WHEEL_B: readonly Star[] = ["mars", "jupiter", "saturn", "uranus", "pluto", "neptune"];

/** `1` se `a` vence `b`, `-1` se `b` vence `a`, `0` se ninguém tem vantagem. */
export function starAdvantage(a: Star, b: Star): 1 | 0 | -1 {
  for (const wheel of [WHEEL_A, WHEEL_B]) {
    const ia = wheel.indexOf(a);
    const ib = wheel.indexOf(b);
    if (ia < 0 || ib < 0) continue;
    const n = wheel.length;
    if ((ia + 1) % n === ib) return 1;
    if ((ib + 1) % n === ia) return -1;
    return 0;
  }
  return 0;
}

// Cada atributo sorteia suas duas estrelas de um grupo de quatro, de forma estável por carta (pelo id).
const POOLS: Record<string, readonly [Star, Star, Star, Star]> = {
  LIGHT: ["sun", "venus", "jupiter", "neptune"],
  DARK: ["moon", "mercury", "pluto", "uranus"],
  FIRE: ["mars", "sun", "pluto", "mercury"],
  WATER: ["neptune", "moon", "saturn", "venus"],
  EARTH: ["saturn", "mars", "uranus", "sun"],
  WIND: ["jupiter", "mercury", "uranus", "moon"],
};
const DEFAULT_POOL: readonly [Star, Star, Star, Star] = ["sun", "moon", "mars", "saturn"];

/** Estrelas de uma carta: determinísticas a partir do id e do atributo (sempre duas estrelas diferentes). */
export function assignStars(id: number, attribute: string | null): [Star, Star] {
  const pool = (attribute && POOLS[attribute]) || DEFAULT_POOL;
  const h = Math.imul(id >>> 0, 2654435761) >>> 0; // hash multiplicativo de Knuth
  const a = h % 4;
  const b = (a + 1 + ((h >>> 8) % 3)) % 4; // sempre diferente de `a`
  return [pool[a]!, pool[b]!];
}
