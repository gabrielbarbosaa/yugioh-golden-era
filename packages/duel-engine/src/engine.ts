import { ATTACK_TRAPS, DIAN_KETO_HEAL, HINOTAMA_DAMAGE, OOKAZI_DAMAGE, POT_OF_GREED_DRAWS } from "./effects.ts";
import { fusionOptions, validateDeck } from "./pool.ts";
import { shuffle } from "./rng.ts";
import { starAdvantage } from "./stars.ts";
import {
  IllegalActionError,
  type Action,
  type AttackAction,
  type Card,
  type ChangePositionAction,
  type Choice,
  type ChooseAction,
  type GameEvent,
  type GameState,
  type MonsterOnField,
  type PlayAction,
  type PlayerIndex,
  type PlayerState,
  type Position,
  type RespondAction,
  type Rules,
  type SetTrapAction,
  type SpellAction,
  type SpellKey,
} from "./types.ts";

export const otherPlayer = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** Quem pode agir agora: o jogador da vez, ou quem precisa responder/escolher quando há algo pendente. */
export const actorOf = (state: GameState): PlayerIndex => (state.pending ? state.pending.player : state.current);

const POSITIONS: readonly Position[] = ["attack", "defense", "facedown", "setattack"];

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
      traps: Array.from({ length: rules.trapZones }, () => null),
      graveyard: [],
    };
    for (let i = 0; i < rules.handSize; i++) p.hand.push(p.deck.pop()!);
    return p;
  }) as [PlayerState, PlayerState];

  return { turn: 1, current: 0, played: false, spellUsed: false, pending: null, players, rng, winner: null, reason: null };
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
  const flip = target.position === "facedown" || target.position === "setattack";
  const defending = target.position === "defense" || target.position === "facedown"; // "facedown" é defesa virada; "setattack" luta como ataque (depois de revelado)
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

  if (next.pending) {
    switch (action.type) {
      case "respond":
        respond(rules, next, action, events);
        break;
      case "pass":
        pass(rules, next, events);
        break;
      case "choose":
        choose(rules, next, action, events);
        break;
      default:
        throw new IllegalActionError("há uma resposta ou escolha pendente");
    }
    return { state: next, events };
  }

  switch (action.type) {
    case "play":
      play(rules, next, action, events);
      break;
    case "attack":
      attack(rules, next, action, events);
      break;
    case "changePosition":
      changePosition(rules, next, action, events);
      break;
    case "endTurn":
      endTurn(rules, next, events);
      break;
    case "spell":
      castSpell(rules, next, action, events);
      break;
    case "setTrap":
      setTrap(rules, next, action, events);
      break;
    case "respond":
    case "pass":
    case "choose":
      throw new IllegalActionError("não há nada para responder agora");
    default:
      throw new IllegalActionError(`ação desconhecida: ${JSON.stringify(action)}`);
  }
  return { state: next, events };
}

function finish(state: GameState, winner: PlayerIndex | "draw", reason: string, events: GameEvent[]) {
  state.winner = winner;
  state.reason = reason;
  state.pending = null;
  events.push({ type: "end", winner, reason });
}

function damage(state: GameState, player: PlayerIndex, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  const p = state.players[player];
  p.lp = Math.max(0, p.lp - amount);
  events.push({ type: "damage", player, amount, lp: p.lp });
  if (p.lp === 0 && state.winner === null) finish(state, otherPlayer(player), "lp", events);
}

function heal(state: GameState, player: PlayerIndex, amount: number, events: GameEvent[]) {
  const p = state.players[player];
  p.lp += amount;
  events.push({ type: "heal", player, amount, lp: p.lp });
}

/** Destrói o monstro da zona (vai ao cemitério do dono). */
function destroyAt(state: GameState, side: PlayerIndex, zone: number, events: GameEvent[]) {
  const p = state.players[side];
  const m = p.field[zone];
  if (!m) return;
  p.field[zone] = null;
  p.graveyard.push(m.cardId);
  events.push({ type: "destroyed", player: side, zone, cardId: m.cardId });
}

function play(rules: Rules, state: GameState, action: PlayAction, events: GameEvent[]) {
  const me = state.players[state.current];
  if (state.played) throw new IllegalActionError("só é possível jogar uma vez por turno");
  const free = me.field.findIndex((m) => m === null);
  // Com o campo cheio é preciso sacrificar um monstro próprio; com zona livre não há sacrifício.
  if (free < 0 && action.sacrifice === undefined) throw new IllegalActionError("o campo de monstros está cheio: escolha um monstro seu para sacrificar");
  if (free >= 0 && action.sacrifice !== undefined) throw new IllegalActionError("só é possível sacrificar com o campo de monstros cheio");
  if (free < 0 && (!Number.isInteger(action.sacrifice) || !me.field[action.sacrifice!])) throw new IllegalActionError("não há monstro nessa zona para sacrificar");
  const zone = free >= 0 ? free : action.sacrifice!;
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

  if (free < 0) {
    const sacrificed = me.field[zone]!;
    me.graveyard.push(sacrificed.cardId);
    events.push({ type: "sacrifice", player: state.current, zone, cardId: sacrificed.cardId });
  }
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

/** O defensor tem como reagir a um ataque (armadilha de ataque virada ou Kuriboh na mão)? */
function canRespondToAttack(rules: Rules, foe: PlayerState): boolean {
  const trap = foe.traps.some((id) => id !== null && ATTACK_TRAPS.includes(rules.support[id]?.effect as never));
  return trap || foe.hand.some((id) => rules.monsterEffects[id] === "kuriboh");
}

function attack(rules: Rules, state: GameState, action: AttackAction, events: GameEvent[]) {
  const attackerIdx = state.current;
  const me = state.players[attackerIdx];
  const foeIdx = otherPlayer(attackerIdx);
  const foe = state.players[foeIdx];

  const mon = me.field[action.zone];
  if (!mon) throw new IllegalActionError("não há monstro nessa zona");
  if (mon.position !== "attack" && mon.position !== "setattack") throw new IllegalActionError("só monstros em posição de ataque podem atacar");
  if (mon.summonedOn >= state.turn) throw new IllegalActionError("o monstro foi jogado neste turno e ainda não pode atacar");
  if (mon.attackedOn === state.turn) throw new IllegalActionError("este monstro já atacou neste turno");

  if (action.target === "direct") {
    if (foe.field.some((m) => m !== null)) throw new IllegalActionError("não é possível atacar direto com monstros do oponente em campo");
  } else if (!foe.field[action.target]) {
    throw new IllegalActionError("não há monstro no alvo");
  }

  // Ataque virado: ao atacar o monstro é revelado (sem efeito de virar; ele não foi virado por um ataque).
  if (mon.position === "setattack") {
    mon.position = "attack";
    events.push({ type: "flip", player: attackerIdx, zone: action.zone, cardId: mon.cardId });
  }
  events.push({ type: "attack", player: attackerIdx, zone: action.zone, target: action.target });
  mon.attackedOn = state.turn;

  // Com uma armadilha de ataque virada (ou Kuriboh na mão) o defensor ganha a chance de responder antes do dano.
  if (canRespondToAttack(rules, foe)) {
    state.pending = { type: "respond", player: foeIdx, attacker: { side: attackerIdx, zone: action.zone }, target: action.target };
    return;
  }
  resolveAttack(rules, state, attackerIdx, action.zone, action.target, events);
}

/** Resolve um ataque declarado (depois de uma eventual resposta). Se o atacante ou o alvo sumiram, não acontece nada. */
function resolveAttack(rules: Rules, state: GameState, attackerIdx: PlayerIndex, zone: number, target: number | "direct", events: GameEvent[]) {
  const me = state.players[attackerIdx];
  const foeIdx = otherPlayer(attackerIdx);
  const foe = state.players[foeIdx];
  const mon = me.field[zone];
  if (!mon) return;

  if (target === "direct") {
    if (foe.field.some((m) => m !== null)) return;
    damage(state, foeIdx, card(rules, mon.cardId).atk, events);
    return;
  }

  const victim = foe.field[target];
  if (!victim) return;

  const outcome = resolveBattle(rules, mon, victim);
  if (outcome.flip) {
    victim.position = victim.position === "setattack" ? "attack" : "defense";
    events.push({ type: "flip", player: foeIdx, zone: target, cardId: victim.cardId });
  }
  if (outcome.destroyTarget) destroyAt(state, foeIdx, target, events);
  if (outcome.destroyAttacker) destroyAt(state, attackerIdx, zone, events);
  damage(state, foeIdx, outcome.damageToTargetOwner, events);
  damage(state, attackerIdx, outcome.damageToAttackerOwner, events);
  // O efeito de virar acontece mesmo que o monstro tenha sido destruído na batalha.
  if (outcome.flip && state.winner === null) triggerFlip(rules, state, foeIdx, victim.cardId, events);
}

/** Efeito de um monstro que acabou de ser virado para cima: automático ou abre uma escolha para o dono. */
function triggerFlip(rules: Rules, state: GameState, owner: PlayerIndex, cardId: number, events: GameEvent[]) {
  const key = rules.monsterEffects[cardId];
  if (!key || key === "kuriboh" || state.winner !== null) return;

  if (key === "magicianOfFaith") {
    const grave = state.players[owner].graveyard;
    let i = grave.length - 1;
    while (i >= 0 && rules.support[grave[i]!]?.kind !== "spell") i--;
    if (i < 0) return;
    events.push({ type: "effect", player: owner, cardId });
    const [id] = grave.splice(i, 1);
    state.players[owner].hand.push(id!);
    events.push({ type: "toHand", player: owner, cardId: id! });
    return;
  }

  const options: Choice[] = [];
  for (const side of [0, 1] as const) {
    state.players[side].field.forEach((m, zone) => {
      if (m) options.push({ kind: "field", side, zone });
    });
  }
  if (options.length === 0) return;
  events.push({ type: "effect", player: owner, cardId });
  state.pending = { type: "choose", player: owner, effect: key, options };
}

function respond(rules: Rules, state: GameState, action: RespondAction, events: GameEvent[]) {
  const pend = state.pending;
  if (pend?.type !== "respond") throw new IllegalActionError("não há ataque para responder");
  const me = state.players[pend.player];
  const attackerSide = pend.attacker.side;
  const attacker = state.players[attackerSide].field[pend.attacker.zone];

  if (action.from === "trap") {
    const id = me.traps[action.index];
    const sup = id === null || id === undefined ? undefined : rules.support[id];
    if (!sup || !ATTACK_TRAPS.includes(sup.effect as never)) throw new IllegalActionError("essa zona não tem uma armadilha que responda a ataques");
    me.traps[action.index] = null;
    me.graveyard.push(sup.id);
    events.push({ type: "trap", player: pend.player, zone: action.index, cardId: sup.id });
    state.pending = null;
    if (sup.effect === "mirrorForce") {
      state.players[attackerSide].field.forEach((m, zone) => {
        if (m?.position === "attack") destroyAt(state, attackerSide, zone, events);
      });
    } else if (sup.effect === "magicCylinder" && attacker) {
      damage(state, attackerSide, card(rules, attacker.cardId).atk, events);
    }
  } else {
    const id = me.hand[action.index];
    if (id === undefined || rules.monsterEffects[id] !== "kuriboh") throw new IllegalActionError("essa carta da mão não pode responder a ataques");
    me.hand.splice(action.index, 1);
    me.graveyard.push(id);
    events.push({ type: "effect", player: pend.player, cardId: id });
    state.pending = null;
  }
  if (state.winner === null) events.push({ type: "negate", player: pend.player });
}

function pass(rules: Rules, state: GameState, events: GameEvent[]) {
  const pend = state.pending;
  if (pend?.type !== "respond") throw new IllegalActionError("não há ataque para responder");
  state.pending = null;
  resolveAttack(rules, state, pend.attacker.side, pend.attacker.zone, pend.target, events);
}

function choose(rules: Rules, state: GameState, action: ChooseAction, events: GameEvent[]) {
  const pend = state.pending;
  if (pend?.type !== "choose") throw new IllegalActionError("não há escolha pendente");
  const option = pend.options[action.index];
  if (!Number.isInteger(action.index) || !option) throw new IllegalActionError("escolha inválida");
  state.pending = null;

  if (pend.effect === "monsterReborn" && option.kind === "grave") {
    const me = state.players[pend.player];
    const zone = me.field.findIndex((m) => m === null);
    const id = state.players[option.side].graveyard[option.index];
    if (zone < 0 || id === undefined) throw new IllegalActionError("não é possível trazer essa carta");
    state.players[option.side].graveyard.splice(option.index, 1);
    me.field[zone] = { cardId: id, position: "attack", star: card(rules, id).stars[0], summonedOn: state.turn, attackedOn: 0, movedOn: 0 };
    events.push({ type: "revive", player: pend.player, zone, cardId: id });
  } else if (pend.effect === "manEaterBug" && option.kind === "field") {
    destroyAt(state, option.side, option.zone, events);
  } else if (pend.effect === "haneHane" && option.kind === "field") {
    const owner = state.players[option.side];
    const m = owner.field[option.zone];
    if (!m) throw new IllegalActionError("não há monstro nessa zona");
    owner.field[option.zone] = null;
    owner.hand.push(m.cardId);
    events.push({ type: "toHand", player: option.side, cardId: m.cardId });
  } else {
    throw new IllegalActionError("escolha inválida para este efeito");
  }
}

function changePosition(rules: Rules, state: GameState, action: ChangePositionAction, events: GameEvent[]) {
  const mon = state.players[state.current].field[action.zone];
  if (!mon) throw new IllegalActionError("não há monstro nessa zona");
  if (action.position !== "attack" && action.position !== "defense") throw new IllegalActionError("posição inválida");
  if (mon.position === action.position) throw new IllegalActionError("o monstro já está nessa posição");
  if (mon.summonedOn >= state.turn) throw new IllegalActionError("o monstro foi jogado neste turno");
  if (mon.attackedOn === state.turn) throw new IllegalActionError("o monstro já atacou neste turno");
  if (mon.movedOn === state.turn) throw new IllegalActionError("o monstro já mudou de posição neste turno");

  const wasFacedown = mon.position === "facedown" || mon.position === "setattack";
  mon.position = action.position;
  mon.movedOn = state.turn;
  if (wasFacedown) events.push({ type: "flip", player: state.current, zone: action.zone, cardId: mon.cardId });
  events.push({ type: "position", player: state.current, zone: action.zone, position: action.position });
  if (wasFacedown) triggerFlip(rules, state, state.current, mon.cardId, events);
}

function endTurn(rules: Rules, state: GameState, events: GameEvent[]) {
  state.turn += 1;
  state.current = otherPlayer(state.current);
  state.played = false;
  state.spellUsed = false;

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

// ---------------------------------------------------------------- magias e armadilhas

/** Monstros dos dois cemitérios que Monster Reborn pode trazer. */
function rebornOptions(rules: Rules, state: GameState): Choice[] {
  const out: Choice[] = [];
  for (const side of [0, 1] as const) {
    state.players[side].graveyard.forEach((id, index) => {
      if (rules.cards[id]) out.push({ kind: "grave", side, index });
    });
  }
  return out;
}

/** O monstro virado para cima de menor ATK do oponente (alvo da Fissure). */
function fissureTarget(rules: Rules, foe: PlayerState): number | null {
  let best: number | null = null;
  foe.field.forEach((m, zone) => {
    if (!m || m.position === "facedown" || m.position === "setattack") return;
    if (best === null || card(rules, m.cardId).atk < card(rules, foe.field[best]!.cardId).atk) best = zone;
  });
  return best;
}

/** A magia tem algum efeito se usada agora? (Evita gastar a carta à toa.) */
function canCast(rules: Rules, state: GameState, key: SpellKey): boolean {
  const me = state.players[state.current];
  const foe = state.players[otherPlayer(state.current)];
  const anyMonster = (p: PlayerState) => p.field.some((m) => m !== null);
  switch (key) {
    case "darkHole":
      return anyMonster(me) || anyMonster(foe);
    case "raigeki":
      return anyMonster(foe);
    case "potOfGreed":
      return me.deck.length > 0;
    case "monsterReborn":
      return me.field.some((m) => m === null) && rebornOptions(rules, state).length > 0;
    case "fissure":
      return fissureTarget(rules, foe) !== null;
    case "ookazi":
    case "hinotama":
    case "dianKeto":
      return true;
  }
}

function castSpell(rules: Rules, state: GameState, action: SpellAction, events: GameEvent[]) {
  if (state.spellUsed) throw new IllegalActionError("só é possível usar uma magia por turno");
  const me = state.players[state.current];
  const foeIdx = otherPlayer(state.current);
  const foe = state.players[foeIdx];
  const id = me.hand[action.hand];
  const sup = id === undefined || !Number.isInteger(action.hand) ? undefined : rules.support[id];
  if (!sup || sup.kind !== "spell") throw new IllegalActionError("essa carta da mão não é uma magia");
  const key = sup.effect as SpellKey;
  if (!canCast(rules, state, key)) throw new IllegalActionError("a magia não teria efeito agora");

  me.hand.splice(action.hand, 1);
  me.graveyard.push(sup.id);
  state.spellUsed = true;
  events.push({ type: "spell", player: state.current, cardId: sup.id });

  switch (key) {
    case "darkHole":
      for (const side of [0, 1] as const) state.players[side].field.forEach((_, zone) => destroyAt(state, side, zone, events));
      break;
    case "raigeki":
      foe.field.forEach((_, zone) => destroyAt(state, foeIdx, zone, events));
      break;
    case "potOfGreed":
      for (let i = 0; i < POT_OF_GREED_DRAWS; i++) {
        const drawn = me.deck.pop();
        if (drawn === undefined) break;
        me.hand.push(drawn);
        events.push({ type: "draw", player: state.current, cardId: drawn });
      }
      break;
    case "monsterReborn":
      state.pending = { type: "choose", player: state.current, effect: "monsterReborn", options: rebornOptions(rules, state) };
      break;
    case "fissure": {
      const zone = fissureTarget(rules, foe);
      if (zone !== null) destroyAt(state, foeIdx, zone, events);
      break;
    }
    case "ookazi":
      damage(state, foeIdx, OOKAZI_DAMAGE, events);
      break;
    case "hinotama":
      damage(state, foeIdx, HINOTAMA_DAMAGE, events);
      break;
    case "dianKeto":
      heal(state, state.current, DIAN_KETO_HEAL, events);
      break;
  }
}

function setTrap(rules: Rules, state: GameState, action: SetTrapAction, events: GameEvent[]) {
  const me = state.players[state.current];
  const id = me.hand[action.hand];
  const sup = id === undefined || !Number.isInteger(action.hand) ? undefined : rules.support[id];
  if (!sup || sup.kind !== "trap") throw new IllegalActionError("essa carta da mão não é uma armadilha");
  const zone = me.traps.findIndex((t) => t === null);
  if (zone < 0) throw new IllegalActionError("não há zona livre para armadilhas");
  me.hand.splice(action.hand, 1);
  me.traps[zone] = sup.id;
  events.push({ type: "set", player: state.current, zone, cardId: sup.id });
}

// ---------------------------------------------------------------- ações possíveis

/** Todas as ações válidas para quem pode agir (`actorOf`); lista vazia se a partida acabou. */
export function legalActions(rules: Rules, state: GameState): Action[] {
  if (state.winner !== null) return [];

  // Resposta ou escolha pendente: só isso é possível.
  if (state.pending?.type === "respond") {
    const me = state.players[state.pending.player];
    const out: Action[] = [];
    me.traps.forEach((id, index) => {
      if (id !== null && ATTACK_TRAPS.includes(rules.support[id]?.effect as never)) out.push({ type: "respond", from: "trap", index });
    });
    me.hand.forEach((id, index) => {
      if (rules.monsterEffects[id] === "kuriboh") out.push({ type: "respond", from: "hand", index });
    });
    out.push({ type: "pass" });
    return out;
  }
  if (state.pending?.type === "choose") return state.pending.options.map((_, index): Action => ({ type: "choose", index }));

  const me = state.players[state.current];
  const foe = state.players[otherPlayer(state.current)];
  const actions: Action[] = [];

  // Jogar uma carta ou uma fusão em cadeia (uma vez por turno). Com o campo cheio, sacrificando um monstro próprio.
  if (!state.played) {
    const full = !me.field.some((m) => m === null);
    const sacrificeZones = full ? me.field.flatMap((m, z) => (m ? [z] : [])) : [undefined];
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
          for (const sacrifice of sacrificeZones) {
            actions.push({
              type: "play",
              hand: seqItem.hand,
              position,
              star,
              ...(seqItem.result !== undefined ? { result: seqItem.result } : {}),
              ...(sacrifice !== undefined ? { sacrifice } : {}),
            });
          }
        }
      }
    }
  }

  // Magias (uma por turno) e armadilhas para pôr viradas.
  const castable = new Set<number>(); // cartas iguais na mão geram uma ação só
  me.hand.forEach((id, hand) => {
    const sup = rules.support[id];
    if (!sup || castable.has(id)) return;
    if (sup.kind === "spell" && !state.spellUsed && canCast(rules, state, sup.effect as SpellKey)) {
      castable.add(id);
      actions.push({ type: "spell", hand });
    } else if (sup.kind === "trap" && me.traps.some((t) => t === null)) {
      castable.add(id);
      actions.push({ type: "setTrap", hand });
    }
  });

  const foeZones = foe.field.flatMap((m, z) => (m ? [z] : []));
  me.field.forEach((m, zone) => {
    if (!m) return;
    if ((m.position === "attack" || m.position === "setattack") && m.summonedOn < state.turn && m.attackedOn !== state.turn) {
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
