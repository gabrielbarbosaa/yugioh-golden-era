import type { Card, Schemas } from '@golden-era/api-client';

export type DeckCards = Schemas['DeckCards'];
export type Zone = 'main' | 'extra' | 'side';

export const ZONES: Zone[] = ['main', 'extra', 'side'];
export const ZONE_LABEL: Record<Zone, string> = { main: 'Deck principal', extra: 'Extra Deck', side: 'Side Deck' };
export const LIMITS: Record<Zone, number> = { main: 60, extra: 15, side: 15 };
/** Um deck só pode ser público com pelo menos 40 cartas no principal; rascunhos privados podem estar incompletos. */
export const MIN_MAIN_PUBLIC = 40;
export const MAX_COPIES = 3;

export const emptyCards = (): DeckCards => ({ main: [], extra: [], side: [] });

/** Cartas do Extra Deck (na era Duel Monsters, só Fusão). O servidor valida de novo. */
export const isExtraCard = (card: Card) => /fusion|synchro|xyz|link/i.test(card.type);

export const zoneCount = (cards: DeckCards, zone: Zone) => cards[zone].reduce((sum, e) => sum + e.quantity, 0);

export const copiesOf = (cards: DeckCards, cardId: number) =>
  ZONES.reduce((sum, z) => sum + (cards[z].find((e) => e.cardId === cardId)?.quantity ?? 0), 0);

/** Zona natural da carta quando o jogador toca em "adicionar ao deck". */
export const homeZone = (card: Card): Zone => (isExtraCard(card) ? 'extra' : 'main');

/** `null` se pode adicionar; senão o motivo, em português. */
export function canAdd(cards: DeckCards, zone: Zone, card: Card): string | null {
  if (copiesOf(cards, card.id) >= MAX_COPIES) return `Máximo de ${MAX_COPIES} cópias por carta`;
  if (zone === 'main' && isExtraCard(card)) return 'Cartas do Extra Deck não vão no deck principal';
  if (zone === 'extra' && !isExtraCard(card)) return 'Esta carta não é do Extra Deck';
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
  const next = cards[zone].flatMap((e) =>
    e.cardId !== cardId ? [e] : e.quantity > 1 ? [{ ...e, quantity: e.quantity - 1 }] : [],
  );
  return { ...cards, [zone]: next };
}

export const allCardIds = (cards: DeckCards): number[] => [
  ...new Set(ZONES.flatMap((z) => cards[z].map((e) => e.cardId))),
];
