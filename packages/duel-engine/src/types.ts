/** Tipos do motor de duelo. Tudo aqui é dado puro (serializável em JSON), exceto onde indicado. */

export const STARS = [
  "sun",
  "moon",
  "venus",
  "mercury",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "pluto",
  "neptune",
] as const;
export type Star = (typeof STARS)[number];

export type Position = "attack" | "defense" | "facedown" | "setattack";
export type PlayerIndex = 0 | 1;

/** Uma carta do "modo FM": só os números que o combate usa, mais estrelas e custo derivados. */
export interface Card {
  id: number;
  name: string;
  /** Monstro de fusão: não entra no baralho, só nasce de uma receita. */
  fusion: boolean;
  atk: number;
  def: number;
  level: number;
  attribute: string | null;
  race: string | null;
  /** As duas estrelas guardiãs possíveis; o jogador escolhe uma ao jogar a carta. */
  stars: [Star, Star];
  /** Custo no baralho (veja cost.ts). */
  cost: number;
}

/** Efeitos de magia/armadilha/monstro implementados (veja effects.ts). */
export type SpellKey = "darkHole" | "raigeki" | "potOfGreed" | "monsterReborn" | "fissure" | "ookazi" | "hinotama" | "dianKeto";
export type TrapKey = "mirrorForce" | "magicCylinder" | "negateAttack";
export type MonsterEffectKey = "manEaterBug" | "haneHane" | "magicianOfFaith" | "kuriboh";
export type EffectKey = SpellKey | TrapKey | MonsterEffectKey;

/** Magia ou armadilha do modo: vai na mão e no baralho junto dos monstros, com um efeito fixo. */
export interface SupportCard {
  id: number;
  name: string;
  kind: "spell" | "trap";
  effect: SpellKey | TrapKey;
}

/** Receita de fusão: os materiais (em qualquer ordem) geram `result`. */
export interface Recipe {
  result: number;
  materials: number[];
}

export interface Rules {
  cards: Record<number, Card>;
  recipes: Recipe[];
  /** Índice `ids ordenados -> resultados possíveis` (um mesmo par pode gerar mais de uma fusão), montado por `buildRules`. */
  recipeIndex: Record<string, number[]>;
  startingLp: number;
  handSize: number;
  fieldSize: number;
  deckSize: number;
  /** Limite de turnos (somando os dois jogadores); ao estourar, empate. */
  maxTurns: number;
  /** Bônus/penalidade de ATK/DEF por vantagem de estrela na batalha. */
  starBonus: number;
  /** Quantas armadilhas viradas cada jogador pode manter em campo. */
  trapZones: number;
  /** Magias e armadilhas jogáveis, por id. */
  support: Record<number, SupportCard>;
  /** Efeitos de monstros (por id da carta): viram ao ser revelado (flip) ou saem da mão (Kuriboh). */
  monsterEffects: Record<number, MonsterEffectKey>;
}

export interface MonsterOnField {
  cardId: number;
  position: Position;
  star: Star;
  /** Turno global em que foi jogado (não ataca nesse turno). */
  summonedOn: number;
  attackedOn: number;
  movedOn: number;
}

export interface PlayerState {
  lp: number;
  /** O topo do baralho é o último elemento. */
  deck: number[];
  hand: number[];
  field: (MonsterOnField | null)[];
  /** Armadilhas viradas para baixo (id da carta, ou `null` se a zona está vazia). */
  traps: (number | null)[];
  graveyard: number[];
}

/** Uma posição do campo de monstros. */
export interface FieldRef {
  side: PlayerIndex;
  zone: number;
}

/** Alvo de uma escolha: um monstro em campo ou uma carta do cemitério (índice em `graveyard`). */
export type Choice = ({ kind: "field" } & FieldRef) | { kind: "grave"; side: PlayerIndex; index: number };

/**
 * Algo que interrompe o fluxo normal do turno: quem age passa a ser `pending.player` (veja `actorOf`).
 * - `respond`: um ataque foi declarado e o defensor pode usar uma armadilha virada ou o Kuriboh da mão (ou deixar passar);
 * - `choose`: um efeito pede que `player` escolha um alvo entre `options`.
 */
export type Pending =
  | { type: "respond"; player: PlayerIndex; attacker: FieldRef; target: number | "direct" }
  | { type: "choose"; player: PlayerIndex; effect: "monsterReborn" | "manEaterBug" | "haneHane"; options: Choice[] };

export interface GameState {
  /** Turno global, começando em 1 (os dois jogadores somam). */
  turn: number;
  current: PlayerIndex;
  /** Já jogou (invocou/fundiu) neste turno. */
  played: boolean;
  /** Já usou uma magia neste turno (uma por turno, além da jogada de monstro). */
  spellUsed: boolean;
  /** Resposta ou escolha em andamento; enquanto houver, só `actorOf(state)` pode agir. */
  pending: Pending | null;
  players: [PlayerState, PlayerState];
  /** Estado do gerador pseudoaleatório (mulberry32): mesma semente, mesma partida. */
  rng: number;
  winner: PlayerIndex | "draw" | null;
  reason: string | null;
}

export interface PlayAction {
  type: "play";
  /** Índices da mão, na ordem. Um índice = invocação simples; vários = fusão em cadeia. */
  hand: number[];
  position: Position;
  /** Qual das duas estrelas da carta (resultante) fica ativa. */
  star: 0 | 1;
  /** Só quando os mesmos materiais geram mais de uma fusão: qual delas o jogador quer. */
  result?: number;
  /**
   * Zona do monstro próprio a sacrificar. Obrigatório quando o campo está cheio (a carta jogada entra no lugar dele e o
   * sacrificado vai ao cemitério); proibido quando há zona livre.
   */
  sacrifice?: number;
}

export interface AttackAction {
  type: "attack";
  zone: number;
  /** Zona do monstro alvo, ou "direct" se o oponente não tem monstros. */
  target: number | "direct";
}

export interface ChangePositionAction {
  type: "changePosition";
  zone: number;
  position: "attack" | "defense";
}

export interface EndTurnAction {
  type: "endTurn";
}

/** Usa uma magia da mão (índice em `hand`). */
export interface SpellAction {
  type: "spell";
  hand: number;
}

/** Põe uma armadilha da mão virada para baixo. */
export interface SetTrapAction {
  type: "setTrap";
  hand: number;
}

/** Em resposta a um ataque: ativa a armadilha da zona `index` ou o monstro da mão `index` (Kuriboh). */
export interface RespondAction {
  type: "respond";
  from: "trap" | "hand";
  index: number;
}

/** Em resposta a um ataque: não faz nada e deixa o ataque acontecer. */
export interface PassAction {
  type: "pass";
}

/** Escolhe o alvo `index` de `pending.options`. */
export interface ChooseAction {
  type: "choose";
  index: number;
}

export type Action = PlayAction | AttackAction | ChangePositionAction | EndTurnAction | SpellAction | SetTrapAction | RespondAction | PassAction | ChooseAction;

export type GameEvent =
  | { type: "draw"; player: PlayerIndex; cardId: number }
  | { type: "play"; player: PlayerIndex; cardId: number; zone: number; position: Position; star: Star | null; materials: number[] }
  | { type: "position"; player: PlayerIndex; zone: number; position: Position }
  | { type: "attack"; player: PlayerIndex; zone: number; target: number | "direct" }
  | { type: "flip"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "damage"; player: PlayerIndex; amount: number; lp: number }
  | { type: "destroyed"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "spell"; player: PlayerIndex; cardId: number }
  | { type: "set"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "trap"; player: PlayerIndex; zone: number; cardId: number }
  /** Efeito de monstro ativado (virar, ou o Kuriboh descartado). */
  | { type: "effect"; player: PlayerIndex; cardId: number }
  | { type: "revive"; player: PlayerIndex; zone: number; cardId: number }
  /** Monstro sacrificado para dar lugar a uma jogada com o campo cheio. */
  | { type: "sacrifice"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "toHand"; player: PlayerIndex; cardId: number }
  | { type: "heal"; player: PlayerIndex; amount: number; lp: number }
  | { type: "negate"; player: PlayerIndex }
  | { type: "turn"; player: PlayerIndex; turn: number }
  | { type: "end"; winner: PlayerIndex | "draw"; reason: string };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
