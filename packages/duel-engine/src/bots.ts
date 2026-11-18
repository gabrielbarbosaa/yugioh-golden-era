import { actorOf, legalActions, otherPlayer, resolveBattle } from "./engine.ts";
import { resolveFusion } from "./pool.ts";
import { starAdvantage } from "./stars.ts";
import type { Action, AttackAction, Choice, GameState, PlayAction, Rules, SpellAction } from "./types.ts";

/** Um bot escolhe a próxima ação a partir do estado (e de um gerador aleatório próprio, separado do jogo). */
export type Bot = (rules: Rules, state: GameState, random: () => number) => Action;

/** Escolhe qualquer ação válida ao acaso; termina o turno com pouca frequência para a partida andar. */
export const randomBot: Bot = (rules, state, random) => {
  const actions = legalActions(rules, state);
  const others = actions.filter((a) => a.type !== "endTurn");
  // Com algo pendente não há "encerrar turno": só responder, passar ou escolher.
  if (others.length > 0 && (state.pending || random() < 0.9)) return others[Math.floor(random() * others.length)]!;
  return { type: "endTurn" };
};

const powerOf = (rules: Rules, id: number) => {
  const c = rules.cards[id]!;
  return Math.max(c.atk, c.def);
};

/**
 * Bot simples com bom senso: funde quando pode, joga a carta mais forte, só ataca quando ganha e
 * deixa em defesa o que não aguenta. Serve de "jogador razoável" para medir equilíbrio.
 */
/** Poder de um alvo de escolha: o ATK da carta (monstro em campo ou do cemitério). */
function choicePower(rules: Rules, state: GameState, c: Choice): number {
  const id = c.kind === "field" ? state.players[c.side].field[c.zone]?.cardId : state.players[c.side].graveyard[c.index];
  return id === undefined ? 0 : (rules.cards[id]?.atk ?? 0);
}

/** Responde ao que está pendente: usa a primeira reação disponível e escolhe sempre o alvo mais forte do oponente. */
function answerPending(rules: Rules, state: GameState, actions: Action[]): Action {
  const pend = state.pending!;
  if (pend.type === "respond") return actions.find((a) => a.type === "respond") ?? { type: "pass" };

  const me = pend.player;
  let best = 0;
  let bestScore = -Infinity;
  pend.options.forEach((o, i) => {
    const power = choicePower(rules, state, o);
    // Destruir/devolver: o monstro mais forte do oponente; reviver: a carta mais forte, de qualquer cemitério.
    const score = pend.effect === "monsterReborn" ? power : o.side === me ? -power - 10000 : power;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return { type: "choose", index: best };
}

/** Vale a pena usar esta magia agora? (O motor já garante que ela tem efeito.) */
function worthCasting(rules: Rules, state: GameState, a: SpellAction): boolean {
  const me = state.players[state.current];
  const foe = state.players[otherPlayer(state.current)];
  const power = (p: typeof me) => p.field.reduce((sum, m) => sum + (m ? (rules.cards[m.cardId]?.atk ?? 0) : 0), 0);
  switch (rules.support[me.hand[a.hand]!]?.effect) {
    case "darkHole":
      return power(foe) > power(me);
    case "dianKeto":
      return me.lp <= rules.startingLp - 1000;
    default:
      return true;
  }
}

export const greedyBot: Bot = (rules, state) => {
  const actor = actorOf(state);
  const me = state.players[actor];
  const foe = state.players[otherPlayer(actor)];
  const actions = legalActions(rules, state);
  if (state.pending) return answerPending(rules, state, actions);

  // 0) Magias úteis e armadilhas para pôr viradas (não gastam a jogada de monstro do turno).
  const spell = actions.find((a): a is SpellAction => a.type === "spell" && worthCasting(rules, state, a));
  if (spell) return spell;
  const trap = actions.find((a) => a.type === "setTrap");
  if (trap) return trap;

  // 1) Jogar: prefere a fusão/monstro mais forte. Com o campo cheio só vale sacrificar o monstro mais fraco, e só por um mais forte.
  let plays = actions.filter((a): a is PlayAction => a.type === "play");
  if (plays.some((p) => p.sacrifice !== undefined)) {
    let weakest = -1;
    me.field.forEach((m, z) => {
      if (m && (weakest < 0 || powerOf(rules, m.cardId) < powerOf(rules, me.field[weakest]!.cardId))) weakest = z;
    });
    const weakestPower = weakest < 0 ? Infinity : powerOf(rules, me.field[weakest]!.cardId);
    plays = plays.filter((p) => {
      const r = pickResult(rules, me.hand, p);
      return p.sacrifice === weakest && r !== null && Math.max(r.atk, r.def) > weakestPower;
    });
  }
  if (plays.length > 0) {
    const score = (a: PlayAction) => {
      const r = pickResult(rules, me.hand, a);
      if (!r) return -1;
      // Fusões (mais de uma carta) valem mais que o monstro isolado de mesmo poder.
      return Math.max(r.atk, r.def) + (a.hand.length > 1 ? 1000 : 0);
    };
    const best = [...plays].sort((x, y) => score(y) - score(x))[0]!;
    // Dentro da mesma jogada, escolhe posição e estrela.
    const variants = plays.filter((p) => p.result === best.result && p.sacrifice === best.sacrifice && p.hand.length === best.hand.length && p.hand.every((h, i) => h === best.hand[i]));
    const foeBest = Math.max(0, ...foe.field.map((m) => (m ? rules.cards[m.cardId]!.atk : 0)));
    const resultCard = pickResult(rules, me.hand, best);
    const wantAttack = resultCard ? resultCard.atk >= foeBest : true;
    const position = wantAttack ? "attack" : resultCard && resultCard.def > resultCard.atk ? "defense" : "facedown";
    const choice = variants.find((v) => v.position === position) ?? variants[0]!;
    // Entre as duas estrelas, a que tem vantagem sobre mais monstros do oponente.
    return bestStar(rules, state, variants.filter((v) => v.position === choice.position)) ?? choice;
  }

  // 2) Atacar só quando o resultado é bom.
  const attacks = actions.filter((a): a is AttackAction => a.type === "attack");
  let bestAttack: AttackAction | null = null;
  let bestGain = 0;
  for (const a of attacks) {
    const mon = me.field[a.zone]!;
    let gain: number;
    if (a.target === "direct") {
      gain = rules.cards[mon.cardId]!.atk;
    } else {
      const o = resolveBattle(rules, mon, foe.field[a.target]!);
      const destroyed = o.destroyTarget ? powerOf(rules, foe.field[a.target]!.cardId) : 0;
      const lost = o.destroyAttacker ? powerOf(rules, mon.cardId) : 0;
      gain = o.damageToTargetOwner + destroyed * 0.5 - o.damageToAttackerOwner - lost * 0.8;
    }
    if (gain > bestGain) {
      bestGain = gain;
      bestAttack = a;
    }
  }
  if (bestAttack) return bestAttack;

  return { type: "endTurn" };
};

function pickResult(rules: Rules, hand: readonly number[], play: PlayAction) {
  return resolveFusion(rules, play.hand.map((i) => hand[i]!), play.result);
}

function bestStar(rules: Rules, state: GameState, variants: PlayAction[]): PlayAction | undefined {
  const me = state.players[state.current];
  const foe = state.players[otherPlayer(state.current)];
  let best: PlayAction | undefined;
  let bestScore = -Infinity;
  for (const v of variants) {
    const result = pickResult(rules, me.hand, v);
    if (!result) continue;
    const star = result.stars[v.star];
    let score = 0;
    for (const m of foe.field) if (m) score += starAdvantage(star, m.star);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}
