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

export type Position = "attack" | "defense" | "facedown";
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
  graveyard: number[];
}

export interface GameState {
  /** Turno global, começando em 1 (os dois jogadores somam). */
  turn: number;
  current: PlayerIndex;
  /** Já jogou (invocou/fundiu) neste turno. */
  played: boolean;
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

export type Action = PlayAction | AttackAction | ChangePositionAction | EndTurnAction;

export type GameEvent =
  | { type: "draw"; player: PlayerIndex; cardId: number }
  | { type: "play"; player: PlayerIndex; cardId: number; zone: number; position: Position; star: Star; materials: number[] }
  | { type: "position"; player: PlayerIndex; zone: number; position: Position }
  | { type: "attack"; player: PlayerIndex; zone: number; target: number | "direct" }
  | { type: "flip"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "damage"; player: PlayerIndex; amount: number; lp: number }
  | { type: "destroyed"; player: PlayerIndex; zone: number; cardId: number }
  | { type: "turn"; player: PlayerIndex; turn: number }
  | { type: "end"; winner: PlayerIndex | "draw"; reason: string };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
