import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeck } from "./deck.ts";
import { actorOf, applyAction, createGame, isLegal, legalActions } from "./engine.ts";
import { validateDeck } from "./pool.ts";
import { mon, stateWith, testRules } from "./test-helpers.ts";
import { IllegalActionError, type GameState } from "./types.ts";
import { eventsFor, HIDDEN_CARD, randomDeck, viewFor } from "./view.ts";

const rules = testRules();
const ids = { darkHole: 201, raigeki: 202, pot: 203, reborn: 204, fissure: 205, ookazi: 206, hinotama: 207, keto: 208, mirror: 211, cylinder: 212, negate: 213 };
const act = (s: GameState, a: Parameters<typeof applyAction>[2]) => applyAction(rules, s, a);

// ------------------------------------------------------------------ magias

test("Dark Hole destrói todos os monstros dos dois lados, vai ao cemitério e consome a magia do turno", () => {
  const s = stateWith(rules, { hand: [[ids.darkHole, ids.raigeki], []], field: [[mon(rules, 1), mon(rules, 2)], [mon(rules, 3)]] });
  const { state, events } = act(s, { type: "spell", hand: 0 });
  assert.ok(state.players[0].field.every((m) => m === null) && state.players[1].field.every((m) => m === null));
  assert.deepEqual(state.players[0].graveyard.sort(), [1, 2, ids.darkHole].sort());
  assert.deepEqual(state.players[1].graveyard, [3]);
  assert.equal(state.spellUsed, true);
  assert.equal(events.filter((e) => e.type === "destroyed").length, 3);
  assert.throws(() => act(state, { type: "spell", hand: 0 }), IllegalActionError, "só uma magia por turno");
});

test("Raigeki destrói só os monstros do oponente e não pode ser usada sem alvo", () => {
  const s = stateWith(rules, { hand: [[ids.raigeki], []], field: [[mon(rules, 1)], [mon(rules, 2), mon(rules, 3)]] });
  const { state } = act(s, { type: "spell", hand: 0 });
  assert.ok(state.players[0].field[0]);
  assert.ok(state.players[1].field.every((m) => m === null));
  const empty = stateWith(rules, { hand: [[ids.raigeki], []], field: [[mon(rules, 1)], []] });
  assert.equal(isLegal(rules, empty, { type: "spell", hand: 0 }), false);
  assert.ok(!legalActions(rules, empty).some((a) => a.type === "spell"));
});

test("Pot of Greed compra 2 cartas", () => {
  const s = stateWith(rules, { hand: [[ids.pot], []], deck: [[101, 102, 103], []] });
  const { state, events } = act(s, { type: "spell", hand: 0 });
  assert.deepEqual(state.players[0].hand, [103, 102]);
  assert.equal(events.filter((e) => e.type === "draw").length, 2);
});

test("Monster Reborn abre uma escolha entre os monstros dos dois cemitérios e o escolhido entra em ataque", () => {
  const s = stateWith(rules, { hand: [[ids.reborn], []], graveyard: [[1, ids.darkHole], [3]] });
  const { state } = act(s, { type: "spell", hand: 0 });
  assert.equal(state.pending?.type, "choose");
  assert.equal(actorOf(state), 0);
  if (state.pending?.type !== "choose") throw new Error("pendente");
  assert.equal(state.pending.options.length, 2, "o cemitério tem 2 monstros (a magia não conta)");
  // Enquanto há escolha pendente nada mais é aceito.
  assert.throws(() => act(state, { type: "endTurn" }), IllegalActionError);
  assert.ok(legalActions(rules, state).every((a) => a.type === "choose"));

  const idx = state.pending.options.findIndex((o) => o.kind === "grave" && o.side === 1);
  const done = act(state, { type: "choose", index: idx });
  assert.equal(done.state.pending, null);
  const revived = done.state.players[0].field[0]!;
  assert.equal(revived.cardId, 3);
  assert.equal(revived.position, "attack");
  assert.deepEqual(done.state.players[1].graveyard, [], "saiu do cemitério do oponente");
  assert.ok(!legalActions(rules, done.state).some((a) => a.type === "attack" && a.zone === 0), "não ataca no turno em que volta");
});

test("Monster Reborn é ilegal sem campo livre ou sem monstros nos cemitérios", () => {
  const full = stateWith(rules, { hand: [[ids.reborn], []], graveyard: [[1], []], field: [[1, 1, 1, 1, 1].map(() => mon(rules, 2)), []] });
  assert.equal(isLegal(rules, full, { type: "spell", hand: 0 }), false);
  const none = stateWith(rules, { hand: [[ids.reborn], []] });
  assert.equal(isLegal(rules, none, { type: "spell", hand: 0 }), false);
});

test("Fissure destrói o monstro virado para cima de menor ATK (ignora os virados para baixo)", () => {
  const s = stateWith(rules, { hand: [[ids.fissure], []], field: [[], [mon(rules, 3), mon(rules, 1, "facedown"), mon(rules, 2, "defense")]] });
  const { state } = act(s, { type: "spell", hand: 0 });
  assert.equal(state.players[1].field[2], null, "o de menor ATK virado para cima (zona 2, ATK 1800) cai");
  assert.ok(state.players[1].field[0] && state.players[1].field[1]);
  const onlyFacedown = stateWith(rules, { hand: [[ids.fissure], []], field: [[], [mon(rules, 1, "facedown")]] });
  assert.equal(isLegal(rules, onlyFacedown, { type: "spell", hand: 0 }), false);
});

test("Ookazi e Hinotama causam dano, Dian Keto cura, e o dano pode vencer a partida", () => {
  const s = stateWith(rules, { hand: [[ids.ookazi, ids.keto], []] });
  const burn = act(s, { type: "spell", hand: 0 }).state;
  assert.equal(burn.players[1].lp, 8000 - 800);
  const heal = act(stateWith(rules, { hand: [[ids.keto], []], lp: [3000, 8000] }), { type: "spell", hand: 0 }).state;
  assert.equal(heal.players[0].lp, 4000);
  const lethal = act(stateWith(rules, { hand: [[ids.hinotama], []], lp: [8000, 400] }), { type: "spell", hand: 0 }).state;
  assert.equal(lethal.winner, 0);
  assert.equal(lethal.reason, "lp");
});

// ------------------------------------------------------------------ armadilhas

test("setTrap põe a armadilha virada em uma zona livre (até o limite) e esconde a carta do oponente", () => {
  let s = stateWith(rules, { hand: [[ids.mirror, ids.cylinder, ids.negate, ids.mirror, 101], []] });
  assert.ok(legalActions(rules, s).some((a) => a.type === "setTrap"));
  for (let i = 0; i < 3; i++) s = act(s, { type: "setTrap", hand: 0 }).state;
  assert.deepEqual(s.players[0].traps.filter((t) => t !== null).length, 3);
  assert.throws(() => act(s, { type: "setTrap", hand: 0 }), IllegalActionError, "sem zona livre ou carta que não é armadilha");
  assert.deepEqual(viewFor(s, 1).players[0].traps, [{ cardId: null }, { cardId: null }, { cardId: null }]);
  assert.equal(viewFor(s, 0).players[0].traps[0]!.cardId, ids.mirror);

  const ev = act(stateWith(rules, { hand: [[ids.mirror], []] }), { type: "setTrap", hand: 0 }).events;
  assert.deepEqual(eventsFor(ev, 1)[0], { type: "set", player: 0, zone: 0, cardId: HIDDEN_CARD });
});

const attackSetup = (extra: Parameters<typeof stateWith>[1] = {}) =>
  stateWith(rules, { field: [[mon(rules, 3, "attack", 0, 0), mon(rules, 2, "attack", 0, 0)], [mon(rules, 1)]], ...extra });

test("ataque contra quem tem armadilha de ataque: o defensor passa a agir e pode deixar passar", () => {
  const s = attackSetup({ traps: [[], [ids.mirror]] });
  const { state } = act(s, { type: "attack", zone: 0, target: 0 });
  assert.equal(state.pending?.type, "respond");
  assert.equal(actorOf(state), 1);
  assert.equal(state.current, 0);
  assert.deepEqual(legalActions(rules, state), [{ type: "respond", from: "trap", index: 0 }, { type: "pass" }]);
  assert.throws(() => act(state, { type: "attack", zone: 1, target: 0 }), IllegalActionError);

  const passed = act(state, { type: "pass" }).state;
  assert.equal(passed.pending, null);
  assert.equal(passed.players[1].field[0], null, "o ataque se resolveu normalmente");
  assert.deepEqual(passed.players[1].traps, [ids.mirror, null, null], "a armadilha continua virada");
});

test("Mirror Force destrói os monstros de ataque do atacante e anula o ataque", () => {
  const s = attackSetup({ traps: [[], [ids.mirror]] });
  const pending = act(s, { type: "attack", zone: 0, target: 0 }).state;
  const { state, events } = act(pending, { type: "respond", from: "trap", index: 0 });
  assert.ok(state.players[0].field.every((m) => m === null));
  assert.ok(state.players[1].field[0], "o defensor não perde nada");
  assert.equal(state.players[1].lp, 8000);
  assert.deepEqual(state.players[1].graveyard, [ids.mirror]);
  assert.equal(state.players[1].traps[0], null);
  assert.ok(events.some((e) => e.type === "trap") && events.some((e) => e.type === "negate"));
  assert.equal(state.pending, null);
});

test("Magic Cylinder anula o ataque e devolve o ATK ao dono do atacante", () => {
  const pending = act(attackSetup({ traps: [[], [ids.cylinder]] }), { type: "attack", zone: 0, target: 0 }).state;
  const { state } = act(pending, { type: "respond", from: "trap", index: 0 });
  assert.equal(state.players[0].lp, 8000 - 2500);
  assert.ok(state.players[0].field[0], "o atacante sobrevive");
  assert.ok(state.players[1].field[0]);
});

test("Negate Attack só anula o ataque; Kuriboh da mão faz o mesmo e vai ao cemitério", () => {
  const n = act(act(attackSetup({ traps: [[], [ids.negate]] }), { type: "attack", zone: 0, target: 0 }).state, { type: "respond", from: "trap", index: 0 }).state;
  assert.ok(n.players[0].field[0] && n.players[1].field[0]);
  assert.equal(n.players[0].lp, 8000);

  const withKuriboh = attackSetup({ hand: [[], [101, 24]] });
  const pending = act(withKuriboh, { type: "attack", zone: 0, target: 0 }).state;
  assert.equal(actorOf(pending), 1);
  assert.deepEqual(legalActions(rules, pending), [{ type: "respond", from: "hand", index: 1 }, { type: "pass" }]);
  const { state } = act(pending, { type: "respond", from: "hand", index: 1 });
  assert.deepEqual(state.players[1].hand, [101]);
  assert.deepEqual(state.players[1].graveyard, [24]);
  assert.ok(state.players[1].field[0], "o alvo sobrevive");
});

test("ataque direto também pode ser respondido", () => {
  const s = stateWith(rules, { field: [[mon(rules, 3)], []], traps: [[], [ids.negate]] });
  const pending = act(s, { type: "attack", zone: 0, target: "direct" }).state;
  assert.equal(actorOf(pending), 1);
  assert.equal(act(pending, { type: "pass" }).state.players[1].lp, 8000 - 2500);
  assert.equal(act(pending, { type: "respond", from: "trap", index: 0 }).state.players[1].lp, 8000);
});

test("sem como responder, o ataque se resolve na hora (como antes)", () => {
  const { state } = act(attackSetup(), { type: "attack", zone: 0, target: 0 });
  assert.equal(state.pending, null);
  assert.equal(state.players[1].field[0], null);
});

test("a visão esconde a armadilha do defensor, mas mostra que há uma resposta pendente", () => {
  const pending = act(attackSetup({ traps: [[], [ids.mirror]] }), { type: "attack", zone: 0, target: 0 }).state;
  const attackerView = viewFor(pending, 0);
  assert.equal(attackerView.actor, 1);
  assert.equal(attackerView.pending?.type, "respond");
  assert.equal(attackerView.players[1].traps[0]!.cardId, null);
  assert.equal(viewFor(pending, 1).players[1].traps[0]!.cardId, ids.mirror);
});

// ------------------------------------------------------------------ efeitos de monstros

test("Man-Eater Bug virado e atacado: o dono escolhe um monstro em campo para destruir", () => {
  const s = stateWith(rules, { field: [[mon(rules, 3), mon(rules, 2)], [mon(rules, 21, "facedown")]] });
  const { state } = act(s, { type: "attack", zone: 0, target: 0 });
  assert.equal(state.pending?.type, "choose");
  assert.equal(actorOf(state), 1, "quem escolhe é o dono do monstro virado");
  if (state.pending?.type !== "choose") throw new Error("pendente");
  const idx = state.pending.options.findIndex((o) => o.kind === "field" && o.side === 0 && o.zone === 0);
  const done = act(state, { type: "choose", index: idx }).state;
  assert.equal(done.players[0].field[0], null, "o atacante foi destruído pelo efeito");
  assert.ok(done.players[0].field[1]);
  assert.equal(actorOf(done), 0, "a vez volta ao jogador da vez");
});

test("Hane-Hane devolve um monstro à mão do dono; o efeito dispara ao virar por troca de posição também", () => {
  const s = stateWith(rules, { field: [[mon(rules, 3)], [mon(rules, 22, "facedown", 0, 0)]], current: 1 });
  const { state } = act(s, { type: "changePosition", zone: 0, position: "attack" });
  assert.equal(state.pending?.type, "choose");
  assert.equal(actorOf(state), 1);
  if (state.pending?.type !== "choose") throw new Error("pendente");
  const idx = state.pending.options.findIndex((o) => o.kind === "field" && o.side === 0);
  const done = act(state, { type: "choose", index: idx }).state;
  assert.equal(done.players[0].field[0], null);
  assert.deepEqual(done.players[0].hand, [3], "voltou à mão do dono");
});

test("Magician of Faith recupera uma magia do cemitério (sem escolha)", () => {
  const s = stateWith(rules, {
    field: [[mon(rules, 3)], [mon(rules, 23, "facedown")]],
    graveyard: [[], [1, ids.raigeki, 2]],
  });
  const { state, events } = act(s, { type: "attack", zone: 0, target: 0 });
  assert.equal(state.pending, null);
  assert.deepEqual(state.players[1].hand, [ids.raigeki]);
  assert.ok(events.some((e) => e.type === "effect"));
});

test("efeitos de virar não disparam em monstros que já estavam virados para cima", () => {
  const s = stateWith(rules, { field: [[mon(rules, 3)], [mon(rules, 21, "attack")]] });
  assert.equal(act(s, { type: "attack", zone: 0, target: 0 }).state.pending, null);
});

test("o baralho aceita magias e armadilhas; buildDeck as mantém e completa com monstros", () => {
  const { deck, report } = buildDeck(
    rules,
    [
      { cardId: ids.darkHole, quantity: 3 },
      { cardId: ids.mirror, quantity: 2 },
      { cardId: 1, quantity: 3 },
      { cardId: 999999, quantity: 1 }, // fora do modo
    ],
    9,
  );
  assert.deepEqual(validateDeck(rules, deck), []);
  assert.deepEqual(report, { used: 8, ignored: 1, filled: 32 });
  assert.equal(deck.filter((id) => id === ids.darkHole).length, 3);

  const game = createGame(rules, [deck, randomDeck(rules, 3)], 5);
  assert.equal(game.players[0].traps.length, rules.trapZones);
  assert.equal(game.pending, null);
  assert.deepEqual(validateDeck(rules, randomDeck(rules, 3)), []);
  assert.ok(randomDeck(rules, 3).some((id) => rules.support[id]), "o baralho aleatório traz algumas magias/armadilhas");
});