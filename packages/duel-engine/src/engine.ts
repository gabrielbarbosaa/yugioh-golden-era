import { fusionOptions, validateDeck } from "./pool.ts";
import { shuffle } from "./rng.ts";
import { starAdvantage } from "./stars.ts";
import {
  IllegalActionError,
  type Action,
  type AttackAction,
  type Card,
  type ChangePositionAction,
  type GameEvent,
  type GameState,
  type MonsterOnField,
  type PlayAction,
  type PlayerIndex,
  type PlayerState,
  type Position,
  type Rules,
} from "./types.ts";

export const otherPlayer = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

const POSITIONS: readonly Position[] = ["attack", "defense", "facedown"];

function card(rules: Rules, id: number): Card {
  const c = rules.cards[id];
  if (!c) throw new IllegalActionError(`carta ${id} desconhecida`);
  return c;
}

/**
 * Começa uma partida: valida os baralhos, embaralha com a semente e compra a mão inicial.
 * O jogador 0 começa; para ser justo em estatísticas, alterne quem é o jogador 0.
 */
export function createGame(rules: Rules, decks: [readonly number[], readonly number[]], seed: number, costCap: number | null = null): GameState {
  decks.forEach((deck, i) => {
    const issues = validateDeck(rules, deck, costCap);
    if (issues.length > 0) throw new IllegalActionError(`baralho do jogador ${i} inválido: ${issues.join("; ")}`);
  });

  let rng = seed >>> 0;
  const players = decks.map((deck): PlayerState => {
    const s = shuffle(deck, rng);
    rng = s.state;
    const p: PlayerState = {
      lp: rules.startingLp,
      deck: s.items,
      hand: [],
      field: Array.from({ length: rules.fieldSize }, () => null),
      graveyard: [],
    };
    for (let i = 0; i < rules.handSize; i++) p.hand.push(p.deck.pop()!);
    return p;
  }) as [PlayerState, PlayerState];

  return { turn: 1, current: 0, played: false, players, rng, winner: null, reason: null };
}

// ---------------------------------------------------------------- batalha

export interface BattleOutcome {
  /** O alvo estava virado para baixo e é revelado (passa para defesa). */
  flip: boolean;
  destroyAttacker: boolean;
  destroyTarget: boolean;
  damageToAttackerOwner: number;
  damageToTargetOwner: number;
  /** ATK do atacante e valor do alvo (ATK ou DEF) já com o bônus de estrela. */
  attackerPower: number;
  targetPower: number;
}

/** Resultado de um ataque monstro contra monstro. Função pura, usada pelo motor e pelos bots. */
export function resolveBattle(rules: Rules, attacker: MonsterOnField, target: MonsterOnField): BattleOutcome {
  const a = card(rules, attacker.cardId);
  const t = card(rules, target.cardId);
  const bonus = starAdvantage(attacker.star, target.star) * rules.starBonus;
  const flip = target.position === "facedown";
  const defending = target.position !== "attack"; // virado para baixo é defesa
  const attackerPower = Math.max(0, a.atk + bonus);
  const targetPower = Math.max(0, (defending ? t.def : t.atk) - bonus);
  const diff = attackerPower - targetPower;

  const out: BattleOutcome = {
    flip,
    destroyAttacker: false,
    destroyTarget: false,
    damageToAttackerOwner: 0,
    damageToTargetOwner: 0,
    attackerPower,
    targetPower,
  };
  if (!defending) {
    if (diff > 0) {
      out.destroyTarget = true;
      out.damageToTargetOwner = diff;
    } else if (diff < 0) {
      out.destroyAttacker = true;
      out.damageToAttackerOwner = -diff;
    } else {
      out.destroyAttacker = true;
      out.destroyTarget = true;
    }
  } else if (diff > 0) {
    out.destroyTarget = true; // acertar a defesa destrói, sem dano à vida
  } else if (diff < 0) {
    out.damageToAttackerOwner = -diff; // bater em defesa mais forte machuca quem atacou
  }
  return out;
}

// ---------------------------------------------------------------- ações

/** Aplica uma ação e devolve o novo estado (o original não é alterado) com os eventos que aconteceram. */
export function applyAction(rules: Rules, state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  if (state.winner !== null) throw new IllegalActionError("a partida já terminou");
  const next = structuredClone(state) as GameState;
  const events: GameEvent[] = [];

  switch (action.type) {
    case "play":
      play(rules, next, action, events);
      break;
    case "attack":
      attack(rules, next, action, events);
      break;
    case "changePosition":
      changePosition(next, action, events);
      break;
    case "endTurn":
      endTurn(rules, next, events);
      break;
    default:
      throw new IllegalActionError(`ação desconhecida: ${JSON.stringify(action)}`);
  }
  return { state: next, events };
}

function finish(state: GameState, winner: PlayerIndex | "draw", reason: string, events: GameEvent[]) {
  state.winner = winner;
  state.reason = reason;
  events.push({ type: "end", winner, reason });
}

function damage(state: GameState, player: PlayerIndex, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  const p = state.players[player];
  p.lp = Math.max(0, p.lp - amount);
  events.push({ type: "damage", player, amount, lp: p.lp });
  if (p.lp === 0 && state.winner === null) finish(state, otherPlayer(player), "lp", events);
}

function play(rules: Rules, state: GameState, action: PlayAction, events: GameEvent[]) {
  const me = state.players[state.current];
  if (state.played) throw new IllegalActionError("só é possível jogar uma vez por turno");
  const zone = me.field.findIndex((m) => m === null);
  if (zone < 0) throw new IllegalActionError("o campo de monstros está cheio");
  if (!POSITIONS.includes(action.position)) throw new IllegalActionError("posição inválida");
  if (action.star !== 0 && action.star !== 1) throw new IllegalActionError("estrela inválida");

  const idx = action.hand;
  if (idx.length < 1 || idx.length > rules.handSize) throw new IllegalActionError("quantidade de cartas inválida");
  if (new Set(idx).size !== idx.length) throw new IllegalActionError("a mesma carta da mão foi usada duas vezes");
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= me.hand.length)) throw new IllegalActionError("índice fora da mão");

  const ids = idx.map((i) => me.hand[i]!);
  const options = fusionOptions(rules, ids);
  if (options.length === 0) throw new IllegalActionError("essa combinação de cartas não forma uma fusão");
  let result: Card;
  if (action.result !== undefined) {
    const chosen = options.find((c) => c.id === action.result);
    if (!chosen) throw new IllegalActionError("o resultado escolhido não é possível com essas cartas");
    result = chosen;
  } else if (options.length > 1) {
    throw new IllegalActionError("fusão ambígua: informe o resultado desejado");
  } else {
    result = options[0]!;
  }

  // Tira as cartas da mão (de trás para frente, para os índices não mudarem).
  for (const i of [...idx].sort((a, b) => b - a)) me.hand.splice(i, 1);
  if (ids.length > 1) me.graveyard.push(...ids); // materiais vão ao cemitério; o resultado entra em campo

  const star = result.stars[action.star];
  me.field[zone] = { cardId: result.id, position: action.position, star, summonedOn: state.turn, attackedOn: 0, movedOn: 0 };
  state.played = true;
  events.push({
    type: "play",
    player: state.current,
    cardId: result.id,
    zone,
    position: action.position,
    star,
    materials: ids.length > 1 ? ids : [],
  });
}

function attack(rules: Rules, state: GameState, action: AttackAction, events: GameEvent[]) {
  const attackerIdx = state.current;
  const me = state.players[attackerIdx];
  const foeIdx = otherPlayer(attackerIdx);
  const foe = state.players[foeIdx];

  const mon = me.field[action.zone];
  if (!mon) throw new IllegalActionError("não há monstro nessa zona");
  if (mon.position !== "attack") throw new IllegalActionError("só monstros em posição de ataque podem atacar");
  if (mon.summonedOn >= state.turn) throw new IllegalActionError("o monstro foi jogado neste turno e ainda não pode atacar");
  if (mon.attackedOn === state.turn) throw new IllegalActionError("este monstro já atacou neste turno");

  const foeHasMonsters = foe.field.some((m) => m !== null);
  events.push({ type: "attack", player: attackerIdx, zone: action.zone, target: action.target });
  mon.attackedOn = state.turn;

  if (action.target === "direct") {
    if (foeHasMonsters) throw new IllegalActionError("não é possível atacar direto com monstros do oponente em campo");
    damage(state, foeIdx, card(rules, mon.cardId).atk, events);
    return;
  }

  const target = foe.field[action.target];
  if (!target) throw new IllegalActionError("não há monstro no alvo");

  const outcome = resolveBattle(rules, mon, target);
  if (outcome.flip) {
    target.position = "defense";
    events.push({ type: "flip", player: foeIdx, zone: action.target, cardId: target.cardId });
  }
  if (outcome.destroyTarget) {
    foe.field[action.target] = null;
    foe.graveyard.push(target.cardId);
    events.push({ type: "destroyed", player: foeIdx, zone: action.target, cardId: target.cardId });
  }
  if (outcome.destroyAttacker) {
    me.field[action.zone] = null;
    me.graveyard.push(mon.cardId);
    events.push({ type: "destroyed", player: attackerIdx, zone: action.zone, cardId: mon.cardId });
  }
  damage(state, foeIdx, outcome.damageToTargetOwner, events);
  damage(state, attackerIdx, outcome.damageToAttackerOwner, events);
}

function changePosition(state: GameState, action: ChangePositionAction, events: GameEvent[]) {
  const mon = state.players[state.current].field[action.zone];
  if (!mon) throw new IllegalActionError("não há monstro nessa zona");
  if (action.position !== "attack" && action.position !== "defense") throw new IllegalActionError("posição inválida");
  if (mon.position === action.position) throw new IllegalActionError("o monstro já está nessa posição");
  if (mon.summonedOn >= state.turn) throw new IllegalActionError("o monstro foi jogado neste turno");
  if (mon.attackedOn === state.turn) throw new IllegalActionError("o monstro já atacou neste turno");
  if (mon.movedOn === state.turn) throw new IllegalActionError("o monstro já mudou de posição neste turno");

  const wasFacedown = mon.position === "facedown";
  mon.position = action.position;
  mon.movedOn = state.turn;
  if (wasFacedown) events.push({ type: "flip", player: state.current, zone: action.zone, cardId: mon.cardId });
  events.push({ type: "position", player: state.current, zone: action.zone, position: action.position });
}

function endTurn(rules: Rules, state: GameState, events: GameEvent[]) {
  state.turn += 1;
  state.current = otherPlayer(state.current);
  state.played = false;

  if (state.turn > rules.maxTurns) {
    finish(state, "draw", "turn-limit", events);
    return;
  }
  events.push({ type: "turn", player: state.current, turn: state.turn });

  // Compra até completar a mão; se o baralho acabar antes, quem ia comprar perde.
  const me = state.players[state.current];
  while (me.hand.length < rules.handSize) {
    const id = me.deck.pop();
    if (id === undefined) {
      finish(state, otherPlayer(state.current), "deck-out", events);
      return;
    }
    me.hand.push(id);
    events.push({ type: "draw", player: state.current, cardId: id });
  }
}

// ---------------------------------------------------------------- ações possíveis

/** Todas as ações válidas para o jogador da vez (lista vazia se a partida acabou). */
export function legalActions(rules: Rules, state: GameState): Action[] {
  if (state.winner !== null) return [];
  const me = state.players[state.current];
  const foe = state.players[otherPlayer(state.current)];
  const actions: Action[] = [];

  // Jogar uma carta ou uma fusão em cadeia (uma vez por turno, com zona livre).
  if (!state.played && me.field.some((m) => m === null)) {
    const seen = new Set<string>();
    const sequences: { hand: number[]; result?: number }[] = [];
    const walk = (seq: number[]) => {
      if (seq.length >= 1) {
        const ids = seq.map((i) => me.hand[i]!);
        const options = fusionOptions(rules, ids);
        for (const option of options) {
          // Ordens diferentes do mesmo conjunto com o mesmo resultado contam como uma só jogada.
          const key = `${[...ids].sort((a, b) => a - b).join(",")}->${option.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          sequences.push(options.length > 1 ? { hand: [...seq], result: option.id } : { hand: [...seq] });
        }
      }
      if (seq.length >= rules.handSize) return;
      for (let i = 0; i < me.hand.length; i++) if (!seq.includes(i)) walk([...seq, i]);
    };
    walk([]);
    for (const seqItem of sequences) {
      for (const position of POSITIONS) {
        for (const star of [0, 1] as const) {
          actions.push({ type: "play", hand: seqItem.hand, position, star, ...(seqItem.result !== undefined ? { result: seqItem.result } : {}) });
        }
      }
    }
  }

  const foeZones = foe.field.flatMap((m, z) => (m ? [z] : []));
  me.field.forEach((m, zone) => {
    if (!m) return;
    if (m.position === "attack" && m.summonedOn < state.turn && m.attackedOn !== state.turn) {
      if (foeZones.length === 0) actions.push({ type: "attack", zone, target: "direct" });
      else for (const target of foeZones) actions.push({ type: "attack", zone, target });
    }
    if (m.summonedOn < state.turn && m.attackedOn !== state.turn && m.movedOn !== state.turn) {
      for (const position of ["attack", "defense"] as const) {
        if (m.position !== position) actions.push({ type: "changePosition", zone, position });
      }
    }
  });

  actions.push({ type: "endTurn" });
  return actions;
}

/** Útil nos testes e na interface: a ação é aceita agora? */
export function isLegal(rules: Rules, state: GameState, action: Action): boolean {
  try {
    applyAction(rules, state, action);
    return true;
  } catch (e) {
    if (e instanceof IllegalActionError) return false;
    throw e;
  }
}
