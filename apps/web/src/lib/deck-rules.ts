import type { Card, Schemas } from "@golden-era/api-client";

// Regras de deck no cliente (espelham `internal/deck` da API e `apps/mobile/src/lib/deck-rules.ts`).
// A API continua sendo a autoridade: o 422 dela é mostrado ao salvar.

export type DeckCards = Schemas["DeckCards"];
export type Zone = "main" | "extra" | "side";
/** O que o editor precisa saber de uma carta. */
export type CardLite = Pick<Card, "id" | "name" | "type" | "imageSmallUrl" | "maxCopies">;

export const ZONES: Zone[] = ["main", "extra", "side"];
export const ZONE_LABEL: Record<Zone, string> = { main: "Deck principal", extra: "Extra Deck", side: "Side Deck" };
export const LIMITS: Record<Zone, number> = { main: 60, extra: 15, side: 15 };
/** Um deck só pode ser público com pelo menos 40 cartas no principal; rascunhos privados podem estar incompletos. */
export const MIN_MAIN_PUBLIC = 40;
export const MAX_COPIES = 3;

export const emptyCards = (): DeckCards => ({ main: [], extra: [], side: [] });

/** Cartas do Extra Deck (na era Duel Monsters, só Fusão). */
export const isExtraCard = (card: Pick<CardLite, "type">) => /fusion|synchro|xyz|link/i.test(card.type);

export const zoneCount = (cards: DeckCards, zone: Zone) => cards[zone].reduce((sum, e) => sum + e.quantity, 0);

export const copiesOf = (cards: DeckCards, cardId: number) =>
  ZONES.reduce((sum, z) => sum + (cards[z].find((e) => e.cardId === cardId)?.quantity ?? 0), 0);

export const homeZone = (card: Pick<CardLite, "type">): Zone => (isExtraCard(card) ? "extra" : "main");

export const maxCopiesOf = (card: Pick<CardLite, "maxCopies">) => Math.min(MAX_COPIES, card.maxCopies);

export function banlistLabel(card: Pick<CardLite, "maxCopies">): string | null {
  switch (card.maxCopies) {
    case 0:
      return "Proibida";
    case 1:
      return "Limitada";
    case 2:
      return "Semilimitada";
    default:
      return null;
  }
}

/** `null` se pode adicionar; senão o motivo, em português. */
export function canAdd(cards: DeckCards, zone: Zone, card: CardLite): string | null {
  const max = maxCopiesOf(card);
  if (max === 0) return "Carta proibida na lista da era";
  if (copiesOf(cards, card.id) >= max) {
    return max < MAX_COPIES
      ? `${banlistLabel(card)} na lista da era: máximo de ${max} ${max === 1 ? "cópia" : "cópias"}`
      : `Máximo de ${MAX_COPIES} cópias por carta`;
  }
  if (zone === "main" && isExtraCard(card)) return "Cartas do Extra Deck não vão no deck principal";
  if (zone === "extra" && !isExtraCard(card)) return "Esta carta não é do Extra Deck";
  if (zoneCount(cards, zone) >= LIMITS[zone]) return `${ZONE_LABEL[zone]} já tem ${LIMITS[zone]} cartas`;
  return null;
}

export function addCard(cards: DeckCards, zone: Zone, cardId: number): DeckCards {
  const entries = cards[zone];
  const next = entries.some((e) => e.cardId === cardId)
    ? entries.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity + 1 } : e))
    : [...entries, { cardId, quantity: 1 }];
  return { ...cards, [zone]: next };
}

export function removeCard(cards: DeckCards, zone: Zone, cardId: number): DeckCards {
  const next = cards[zone].flatMap((e) => (e.cardId !== cardId ? [e] : e.quantity > 1 ? [{ ...e, quantity: e.quantity - 1 }] : []));
  return { ...cards, [zone]: next };
}