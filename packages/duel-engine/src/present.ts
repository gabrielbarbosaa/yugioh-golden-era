// Apresentação do duelo: textos, anúncios e efeitos visuais derivados dos eventos. Código puro, sem tela: o site e o
// app usam o mesmo, então os dois contam a partida do mesmo jeito.

import type { DeckReport } from "./deck.ts";
import type { CardInfo, SupportInfo } from "./protocol.ts";
import type { GameEvent } from "./types.ts";

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

/** O que o cliente sabe da partida: quem é você, o oponente e os dados públicos das cartas. */
export interface Match {
  room: string;
  you: 0 | 1;
  opponent: string;
  cards: Record<number, CardInfo>;
  support: Record<number, SupportInfo>;
  deck?: { name: string } & DeckReport;
}

/** Carta que o jogo anuncia no meio da mesa (magia, armadilha, efeito, fusão...). */
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

/** Efeito visual curto numa zona (`jogador:zona`) ou na vida (`lp:jogador`). */
export interface Fx {
  id: number;
  kind: "attack" | "summon" | "ghost" | "damage" | "heal";
  cardId?: number;
  text?: string;
}

/** Texto de uma linha do histórico, na visão de quem lê. */
export function describeEvent(e: GameEvent, you: number, cards: Record<number, CardInfo>, support: Record<number, SupportInfo>, foe: string): string {
  const who = (p: number) => (p === you ? "Você" : foe);
  const name = (id: number) => (id < 0 ? "uma carta" : (cards[id]?.name ?? support[id]?.name ?? `#${id}`));
  switch (e.type) {
    case "draw":
      return e.player === you ? `Você comprou ${name(e.cardId)}.` : `${foe} comprou uma carta.`;
    case "play":
      return `${who(e.player)} jogou ${name(e.cardId)} em ${POSITION_NAMES[e.position]}${e.materials.length ? " (fusão)" : ""}.`;
    case "position":
      return `${who(e.player)} mudou um monstro para ${POSITION_NAMES[e.position]}.`;
    case "attack":
      return `${who(e.player)} atacou ${e.target === "direct" ? "direto" : `a zona ${e.target + 1}`}.`;
    case "flip":
      return `${name(e.cardId)} foi revelada.`;
    case "damage":
      return `${who(e.player)} perdeu ${e.amount} LP (restam ${e.lp}).`;
    case "destroyed":
      return `${name(e.cardId)} de ${who(e.player)} foi destruída.`;
    case "spell":
      return `${who(e.player)} usou a magia ${name(e.cardId)}.`;
    case "set":
      return e.player === you ? `Você pôs ${name(e.cardId)} virada.` : `${foe} pôs uma carta virada.`;
    case "trap":
      return `${who(e.player)} ativou a armadilha ${name(e.cardId)}!`;
    case "effect":
      return `${who(e.player)} ativou o efeito de ${name(e.cardId)}.`;
    case "sacrifice":
      return `${who(e.player)} sacrificou ${name(e.cardId)}.`;
    case "revive":
      return `${who(e.player)} trouxe ${name(e.cardId)} de volta ao campo.`;
    case "toHand":
      return `${name(e.cardId)} voltou para a mão de ${e.player === you ? "você" : foe}.`;
    case "heal":
      return `${who(e.player)} recuperou ${e.amount} LP (agora ${e.lp}).`;
    case "negate":
      return "O ataque foi anulado.";
    case "turn":
      return `Turno ${e.turn}: vez de ${e.player === you ? "você" : foe}.`;
    case "end":
      return e.winner === "draw" ? `Empate (${e.reason}).` : `${e.winner === you ? "Você venceu" : `${foe} venceu`} (${e.reason}).`;
  }
}

/** Anúncios (carta grande no meio da mesa) para os eventos que o adversário precisa ver. */
export function revealsFor(events: GameEvent[], m: Match, nextKey: () => number): Reveal[] {
  const out: Reveal[] = [];
  const who = (p: number) => (p === m.you ? "Você" : m.opponent);
  for (const e of events) {
    let title: string;
    let kind: Reveal["kind"];
    if (e.type === "play") {
      // Só fusões à vista (virada para baixo, o oponente não recebe as cartas).
      if (e.materials.length < 2 || e.cardId < 0) continue;
      out.push({ key: nextKey(), id: e.cardId, title: `${who(e.player)} fundiu`, name: factsOf(m, e.cardId).name, text: "", kind: "fusion", materials: e.materials });
      continue;
    } else if (e.type === "spell") {
      title = `${who(e.player)} usou a magia`;
      kind = "spell";
    } else if (e.type === "trap") {
      title = `${who(e.player)} ativou a armadilha`;
      kind = "trap";
    } else if (e.type === "effect") {
      title = `${who(e.player)} ativou o efeito de`;
      kind = "effect";
    } else if (e.type === "revive") {
      title = `${who(e.player)} trouxe de volta`;
      kind = "revive";
    } else if (e.type === "flip") {
      title = "Carta virada para cima";
      kind = "flip";
    } else {
      continue;
    }
    if (e.cardId < 0) continue;
    const f = factsOf(m, e.cardId);
    out.push({ key: nextKey(), id: e.cardId, title, name: f.name, text: f.text ?? "", kind });
  }
  return out;
}

/** Efeitos visuais curtos (ataque, invocação, destruição, dano e cura) para os eventos recebidos. */
export function fxFor(events: GameEvent[], nextId: () => number): Record<string, Fx> {
  const out: Record<string, Fx> = {};
  for (const e of events) {
    if (e.type === "attack") out[`${e.player}:${e.zone}`] = { id: nextId(), kind: "attack" };
    else if (e.type === "play" || e.type === "revive") out[`${e.player}:${e.zone}`] = { id: nextId(), kind: "summon" };
    else if ((e.type === "destroyed" || e.type === "sacrifice") && e.cardId >= 0) out[`${e.player}:${e.zone}`] = { id: nextId(), kind: "ghost", cardId: e.cardId };
    else if (e.type === "damage") out[`lp:${e.player}`] = { id: nextId(), kind: "damage", text: `−${e.amount}` };
    else if (e.type === "heal") out[`lp:${e.player}`] = { id: nextId(), kind: "heal", text: `+${e.amount}` };
  }
  return out;
}

/** O lance inclui uma fusão à vista? (A animação de fusão cobre a mesa; o efeito da invocação espera por ela.) */
export const hasFusion = (events: GameEvent[]): boolean => events.some((e) => e.type === "play" && e.materials.length > 1 && e.cardId >= 0);