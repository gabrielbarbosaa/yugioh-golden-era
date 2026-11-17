import assert from "node:assert/strict";
import { test } from "node:test";

import { greedyBot, randomBot } from "./bots.ts";
import { applyAction, createGame, isLegal, legalActions } from "./engine.ts";
import { makeRandom } from "./rng.ts";
import { fillerDeck, mon, setStars, stateWith, testRules } from "./test-helpers.ts";
import { IllegalActionError, type Action, type GameState, type Rules } from "./types.ts";

const play = (hand: number[], position: "attack" | "defense" | "facedown" = "attack", star: 0 | 1 = 0): Action => ({ type: "play", hand, position, star });
const attackAction = (zone: number, target: number | "direct"): Action => ({ type: "attack", zone, target });
const endTurn: Action = { type: "endTurn" };

function run(rules: Rules, state: GameState, ...actions: Action[]): GameState {
  let s = state;
  for (const a of actions) s = applyAction(rules, s, a).state;
  return s;
}

// ------------------------------------------------------------ preparação

test("createGame: mão de 5, baralho de 35, 8000 de vida e jogador 0 começa", () => {
  const rules = testRules();
  const g = createGame(rules, [fillerDeck(), fillerDeck()], 123);
  for (const p of g.players) {
    assert.equal(p.hand.length, 5);
    assert.equal(p.deck.length, 35);
    assert.equal(p.lp, 8000);
    assert.equal(p.field.length, 5);
  }
  assert.equal(g.current, 0);
  assert.equal(g.turn, 1);
  assert.equal(g.winner, null);
});

test("createGame: mesma semente = mesma partida; outra semente embaralha diferente", () => {
  const rules = testRules();
  const a = createGame(rules, [fillerDeck(), fillerDeck()], 7);
  const b = createGame(rules, [fillerDeck(), fillerDeck()], 7);
  const c = createGame(rules, [fillerDeck(), fillerDeck()], 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.players[0].hand, c.players[0].hand);
});

test("createGame: recusa baralhos inválidos", () => {
  const rules = testRules();
  const ok = fillerDeck();
  assert.throws(() => createGame(rules, [ok.slice(0, 39), ok], 1), IllegalActionError); // 39 cartas
  assert.throws(() => createGame(rules, [[...ok.slice(0, 36), 101, 101, 101, 101], ok], 1), /máximo 3/); // 5 cópias de 101
  assert.throws(() => createGame(rules, [[...ok.slice(0, 39), 7], ok], 1), /fusão/); // fusão no baralho
  assert.throws(() => createGame(rules, [[...ok.slice(0, 39), 999], ok], 1), /não existe/);
  assert.throws(() => createGame(rules, [ok, ok], 1, 10), /custo/); // teto de custo
});

// ------------------------------------------------------------ turnos

test("endTurn: passa a vez, compra até completar 5 cartas e zera a jogada do turno", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 2, current: 0, hand: [[1], [1, 2]], deck: [[101], [101, 102, 103, 104, 105]] });
  const s1 = applyAction(rules, { ...s0, played: true }, endTurn).state;
  assert.equal(s1.turn, 3);
  assert.equal(s1.current, 1);
  assert.equal(s1.played, false);
  assert.equal(s1.players[1].hand.length, 5);
  assert.equal(s1.players[1].deck.length, 2);
});

test("endTurn: quem não consegue comprar por baralho vazio perde", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { current: 0, hand: [[], [1]], deck: [[101], [101, 102]] }); // o jogador 1 precisa de 4 cartas e só tem 2
  const s1 = applyAction(rules, s0, endTurn).state;
  assert.equal(s1.winner, 0);
  assert.equal(s1.reason, "deck-out");
  assert.throws(() => applyAction(rules, s1, endTurn), /já terminou/);
  assert.deepEqual(legalActions(rules, s1), []);
});

test("endTurn: estourar o limite de turnos empata", () => {
  const rules = testRules();
  rules.maxTurns = 10;
  const s0 = stateWith(rules, { turn: 10, hand: [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1]] });
  const s1 = applyAction(rules, s0, endTurn).state;
  assert.equal(s1.winner, "draw");
  assert.equal(s1.reason, "turn-limit");
});

// ------------------------------------------------------------ jogar cartas

test("play: invoca em campo na posição e estrela escolhidas e só uma vez por turno", () => {
  const rules = testRules();
  setStars(rules, 2, ["sun", "mars"]);
  const s0 = stateWith(rules, { hand: [[1, 2, 3], []] });
  const s1 = applyAction(rules, s0, play([1], "defense", 1)).state;
  assert.deepEqual(s1.players[0].hand, [1, 3]);
  const m = s1.players[0].field[0]!;
  assert.equal(m.cardId, 2);
  assert.equal(m.position, "defense");
  assert.equal(m.star, "mars");
  assert.equal(m.summonedOn, s1.turn);
  assert.equal(s1.played, true);
  assert.throws(() => applyAction(rules, s1, play([0])), /uma vez por turno/);
});

test("play: campo cheio e índices inválidos são recusados", () => {
  const rules = testRules();
  const full = stateWith(rules, { hand: [[1], []], field: [[1, 1, 1, 1, 1].map((id) => mon(rules, id)), []] });
  assert.throws(() => applyAction(rules, full, play([0])), /cheio/);
  const s = stateWith(rules, { hand: [[1, 2], []] });
  assert.throws(() => applyAction(rules, s, play([5])), /fora da mão/);
  assert.throws(() => applyAction(rules, s, play([0, 0])), /duas vezes/);
  assert.throws(() => applyAction(rules, s, play([])), /quantidade/);
  assert.throws(() => applyAction(rules, s, play([0], "attack", 2 as 0)), /estrela/);
});

test("o monstro jogado neste turno não ataca, mas ataca no turno seguinte do mesmo jogador", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 2, current: 0, hand: [[3], [1]] });
  const s1 = applyAction(rules, s0, play([0])).state;
  assert.equal(isLegal(rules, s1, attackAction(0, "direct")), false);
  const s2 = run(rules, s1, endTurn, endTurn); // vez do oponente, volta para o jogador 0
  assert.equal(s2.current, 0);
  assert.equal(isLegal(rules, s2, attackAction(0, "direct")), true);
});

// ------------------------------------------------------------ batalha

function duel(rules: Rules, attackerId: number, targetId: number, targetPos: "attack" | "defense" | "facedown") {
  setStars(rules, attackerId, ["sun", "sun"]);
  setStars(rules, targetId, ["sun", "sun"]); // mesma estrela: sem vantagem
  const s = stateWith(rules, {
    turn: 5,
    current: 0,
    field: [[mon(rules, attackerId, "attack", 0, 1)], [mon(rules, targetId, targetPos, 0, 1)]],
  });
  return applyAction(rules, s, attackAction(0, 0)).state;
}

test("ataque x ataque: o mais forte destrói o outro e a diferença vira dano", () => {
  const rules = testRules();
  const s = duel(rules, 3, 2, "attack"); // 2500 x 1800
  assert.equal(s.players[1].field[0], null);
  assert.notEqual(s.players[0].field[0], null);
  assert.equal(s.players[1].lp, 8000 - 700);
  assert.equal(s.players[0].lp, 8000);
  assert.deepEqual(s.players[1].graveyard, [2]);
});

test("ataque x ataque: o atacante mais fraco morre e sofre a diferença", () => {
  const rules = testRules();
  const s = duel(rules, 2, 3, "attack"); // 1800 x 2500
  assert.equal(s.players[0].field[0], null);
  assert.notEqual(s.players[1].field[0], null);
  assert.equal(s.players[0].lp, 8000 - 700);
  assert.equal(s.players[1].lp, 8000);
});

test("ataque x ataque: empate destrói os dois sem dano", () => {
  const rules = testRules();
  const s = duel(rules, 2, 2, "attack");
  assert.equal(s.players[0].field[0], null);
  assert.equal(s.players[1].field[0], null);
  assert.equal(s.players[0].lp, 8000);
  assert.equal(s.players[1].lp, 8000);
});

test("ataque x defesa: ATK maior destrói sem dano; menor fere o atacante; igual não faz nada", () => {
  const rules = testRules();
  const win = duel(rules, 3, 4, "defense"); // 2500 x DEF 2300
  assert.equal(win.players[1].field[0], null);
  assert.equal(win.players[1].lp, 8000);

  const lose = duel(rules, 2, 4, "defense"); // 1800 x DEF 2300
  assert.notEqual(lose.players[1].field[0], null);
  assert.notEqual(lose.players[0].field[0], null);
  assert.equal(lose.players[0].lp, 8000 - 500);

});

test("ataque x defesa com ATK igual à DEF: nada acontece", () => {
  const rules = testRules();
  rules.cards[1]!.atk = 1000;
  rules.cards[1]!.def = 1000;
  const s = duel(rules, 1, 1, "defense");
  assert.notEqual(s.players[0].field[0], null);
  assert.notEqual(s.players[1].field[0], null);
  assert.equal(s.players[0].lp, 8000);
  assert.equal(s.players[1].lp, 8000);
});

test("monstro virado para baixo é revelado ao ser atacado e luta com a DEF", () => {
  const rules = testRules();
  const s = duel(rules, 2, 4, "facedown"); // 1800 x DEF 2300: o atacante se machuca e o alvo fica virado para cima
  assert.equal(s.players[1].field[0]!.position, "defense");
  assert.equal(s.players[0].lp, 8000 - 500);
});

test("ataque direto só com o campo do oponente vazio e causa o ATK inteiro", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "attack", 0, 1)], []] });
  const s1 = applyAction(rules, s0, attackAction(0, "direct")).state;
  assert.equal(s1.players[1].lp, 8000 - 2500);

  const blocked = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "attack", 0, 1)], [mon(rules, 4, "defense", 0, 1)]] });
  assert.throws(() => applyAction(rules, blocked, attackAction(0, "direct")), /direto/);
});

test("regras de quem pode atacar: posição, uma vez por turno e alvo existente", () => {
  const rules = testRules();
  const inDefense = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "defense", 0, 1)], []] });
  assert.throws(() => applyAction(rules, inDefense, attackAction(0, "direct")), /posição de ataque/);

  const s0 = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "attack", 0, 1), mon(rules, 2, "attack", 0, 1)], []] });
  const s1 = applyAction(rules, s0, attackAction(0, "direct")).state;
  assert.throws(() => applyAction(rules, s1, attackAction(0, "direct")), /já atacou/);
  assert.equal(isLegal(rules, s1, attackAction(1, "direct")), true); // o outro monstro ainda pode

  const noTarget = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "attack", 0, 1)], [mon(rules, 2, "attack", 0, 1)]] });
  assert.throws(() => applyAction(rules, noTarget, attackAction(0, 3)), /alvo/);
  assert.throws(() => applyAction(rules, noTarget, attackAction(4, 0)), /zona/);
});

test("vantagem de estrela: +500 para quem vence a estrela e -500 para o outro, só na batalha", () => {
  const rules = testRules();
  // 1800 contra 2000 perderia; com vantagem vira 2300 x 1500 e ganha.
  rules.cards[2]!.atk = 1800;
  rules.cards[3]!.atk = 2000;
  setStars(rules, 2, ["sun", "sun"]);
  setStars(rules, 3, ["moon", "moon"]); // sol vence lua
  const s0 = stateWith(rules, { turn: 5, field: [[mon(rules, 2, "attack", 0, 1)], [mon(rules, 3, "attack", 0, 1)]] });
  const s1 = applyAction(rules, s0, attackAction(0, 0)).state;
  assert.equal(s1.players[1].field[0], null);
  assert.equal(s1.players[1].lp, 8000 - 800);
  // O número impresso da carta não mudou.
  assert.equal(rules.cards[2]!.atk, 1800);

  // E o contrário: com a estrela em desvantagem, o mais forte no papel perde.
  setStars(rules, 2, ["moon", "moon"]);
  setStars(rules, 3, ["sun", "sun"]);
  rules.cards[2]!.atk = 2000;
  rules.cards[3]!.atk = 2300;
  const t0 = stateWith(rules, { turn: 5, field: [[mon(rules, 2, "attack", 0, 1)], [mon(rules, 3, "attack", 0, 1)]] });
  const t1 = applyAction(rules, t0, attackAction(0, 0)).state;
  assert.equal(t1.players[0].field[0], null); // 2000-500 contra 2300+500
});

test("a partida acaba quando a vida chega a zero", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, lp: [8000, 2000], field: [[mon(rules, 3, "attack", 0, 1)], []] });
  const s1 = applyAction(rules, s0, attackAction(0, "direct")).state;
  assert.equal(s1.players[1].lp, 0);
  assert.equal(s1.winner, 0);
  assert.equal(s1.reason, "lp");
  assert.deepEqual(legalActions(rules, s1), []);
});

// ------------------------------------------------------------ posição

test("changePosition: uma vez por turno, nunca no turno em que foi jogado nem depois de atacar", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, field: [[mon(rules, 3, "attack", 0, 1), mon(rules, 2, "facedown", 0, 1), mon(rules, 1, "attack", 0, 5)], []] });
  const toDef = applyAction(rules, s0, { type: "changePosition", zone: 0, position: "defense" }).state;
  assert.equal(toDef.players[0].field[0]!.position, "defense");
  assert.throws(() => applyAction(rules, toDef, { type: "changePosition", zone: 0, position: "attack" }), /já mudou/);

  const flipped = applyAction(rules, s0, { type: "changePosition", zone: 1, position: "attack" });
  assert.equal(flipped.state.players[0].field[1]!.position, "attack");
  assert.ok(flipped.events.some((e) => e.type === "flip"));

  assert.throws(() => applyAction(rules, s0, { type: "changePosition", zone: 2, position: "defense" }), /jogado neste turno/);
  assert.throws(() => applyAction(rules, s0, { type: "changePosition", zone: 0, position: "attack" }), /já está/);

  const attacked = applyAction(rules, s0, attackAction(0, "direct")).state;
  assert.throws(() => applyAction(rules, attacked, { type: "changePosition", zone: 0, position: "defense" }), /já atacou/);
});

// ------------------------------------------------------------ fusão

test("fusão de dois materiais: materiais vão ao cemitério e o resultado entra em campo", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { hand: [[5, 1, 6], []] });
  const { state, events } = applyAction(rules, s0, play([0, 2], "attack", 0));
  assert.deepEqual(state.players[0].hand, [1]);
  assert.deepEqual(state.players[0].graveyard.sort(), [5, 6]);
  assert.equal(state.players[0].field[0]!.cardId, 7);
  assert.equal(state.played, true);
  const e = events.find((x) => x.type === "play");
  assert.ok(e && e.type === "play" && e.materials.length === 2 && e.cardId === 7);
});

test("fusão: a ordem dos materiais não importa; combinação sem receita é recusada", () => {
  const rules = testRules();
  const s = stateWith(rules, { hand: [[6, 5, 1], []] });
  assert.equal(applyAction(rules, s, play([0, 1])).state.players[0].field[0]!.cardId, 7);
  assert.throws(() => applyAction(rules, s, play([0, 2])), /não forma uma fusão/); // Dragão B + Fraco
});

test("fusão com 3 materiais iguais e fusão em cadeia (fusão + carta)", () => {
  const rules = testRules();
  const triple = stateWith(rules, { hand: [[5, 5, 5, 1], []] });
  assert.equal(applyAction(rules, triple, play([0, 1, 2])).state.players[0].field[0]!.cardId, 8);

  // 5+6 -> 7 (Fusão Dragão); 7 + 3 -> 9 (Fusão Cadeia)
  const chain = stateWith(rules, { hand: [[5, 6, 3], []] });
  const s = applyAction(rules, chain, play([0, 1, 2])).state;
  assert.equal(s.players[0].field[0]!.cardId, 9);
  assert.deepEqual(s.players[0].hand, []);
  assert.deepEqual(s.players[0].graveyard.sort(), [3, 5, 6]);
});

test("fusão ambígua: mesmos materiais, dois resultados; é preciso escolher", () => {
  const rules = testRules();
  const s = stateWith(rules, { hand: [[1, 2, 3], []] });
  assert.throws(() => applyAction(rules, s, play([0, 1])), /ambígua/);
  assert.throws(() => applyAction(rules, s, { ...(play([0, 1]) as Extract<Action, { type: "play" }>), result: 7 }), /não é possível/);

  const b = applyAction(rules, s, { ...(play([0, 1]) as Extract<Action, { type: "play" }>), result: 11 }).state;
  assert.equal(b.players[0].field[0]!.cardId, 11);

  const plays = legalActions(rules, s).filter((a) => a.type === "play" && a.hand.length === 2 && a.result !== undefined);
  assert.deepEqual([...new Set(plays.map((a) => (a as Extract<Action, { type: "play" }>).result))].sort(), [10, 11]);
});
// ------------------------------------------------------------ ações possíveis e determinismo

test("legalActions lista jogadas simples e fusões; cada ação listada é aceita pelo motor", () => {
  const rules = testRules();
  const s = stateWith(rules, { turn: 5, hand: [[5, 6, 1], []], field: [[mon(rules, 3, "attack", 0, 1), mon(rules, 2, "defense", 0, 1)], [mon(rules, 4, "defense", 0, 1)]] });
  const actions = legalActions(rules, s);
  const fusions = actions.filter((a) => a.type === "play" && a.hand.length === 2);
  assert.ok(fusions.length > 0, "devia haver a fusão 5+6");
  assert.ok(actions.some((a) => a.type === "attack"));
  assert.ok(actions.some((a) => a.type === "changePosition"));
  assert.ok(actions.some((a) => a.type === "endTurn"));
  for (const a of actions) assert.equal(isLegal(rules, s, a), true, JSON.stringify(a));
});

function playout(rules: Rules, seed: number, botSeed: number, bots = [randomBot, greedyBot] as const): GameState {
  let s = createGame(rules, [fillerDeck(), fillerDeck()], seed);
  const random = makeRandom(botSeed);
  let guard = 0;
  while (s.winner === null) {
    const bot = bots[s.current]!;
    s = applyAction(rules, s, bot(rules, s, random)).state;
    assert.ok(++guard < 5000, "a partida não terminou");
  }
  return s;
}

test("partidas inteiras com bots: sempre terminam, nunca quebram e mantêm os invariantes", () => {
  const rules = testRules();
  for (let seed = 1; seed <= 40; seed++) {
    let s = createGame(rules, [fillerDeck(), fillerDeck()], seed);
    const random = makeRandom(seed * 7);
    let guard = 0;
    while (s.winner === null) {
      const bot = seed % 2 === 0 ? randomBot : greedyBot;
      const action = bot(rules, s, random);
      assert.equal(isLegal(rules, s, action), true, `${seed}: ${JSON.stringify(action)}`);
      s = applyAction(rules, s, action).state;
      for (const p of s.players) {
        assert.ok(p.hand.length <= rules.handSize);
        assert.equal(p.field.length, rules.fieldSize);
        assert.ok(p.lp >= 0);
      }
      assert.ok(++guard < 5000);
    }
    assert.ok(["lp", "deck-out", "turn-limit"].includes(s.reason!));
  }
});

test("determinismo: mesma semente e mesmos bots geram exatamente a mesma partida", () => {
  const rules = testRules();
  assert.deepEqual(playout(rules, 99, 5), playout(rules, 99, 5));
});

test("applyAction não altera o estado de entrada", () => {
  const rules = testRules();
  const s = stateWith(rules, { hand: [[1, 2], []] });
  const copy = structuredClone(s);
  applyAction(rules, s, play([0]));
  assert.deepEqual(s, copy);
});
