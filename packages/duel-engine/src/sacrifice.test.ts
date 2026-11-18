import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction, isLegal, legalActions } from "./engine.ts";
import { mon, stateWith, testRules } from "./test-helpers.ts";
import { IllegalActionError, type PlayAction } from "./types.ts";

const rules = testRules();
const fullField = () => [mon(rules, 1), mon(rules, 2), mon(rules, 4), mon(rules, 5), mon(rules, 6)];
const play = (hand: number[], sacrifice?: number): PlayAction => ({ type: "play", hand, position: "attack", star: 0, ...(sacrifice !== undefined ? { sacrifice } : {}) });

test("campo cheio: sem sacrifício a jogada é recusada; com sacrifício o monstro escolhido vai ao cemitério e a carta entra no lugar dele", () => {
  const s = stateWith(rules, { hand: [[3], []], field: [fullField(), []] });
  assert.throws(() => applyAction(rules, s, play([0])), /sacrificar/);

  const { state, events } = applyAction(rules, s, play([0], 2));
  assert.equal(state.players[0].field[2]!.cardId, 3, "a carta nova ocupa a zona do sacrificado");
  assert.deepEqual(state.players[0].graveyard, [4]);
  assert.deepEqual(state.players[0].hand, []);
  assert.equal(state.played, true);
  assert.deepEqual(events.find((e) => e.type === "sacrifice"), { type: "sacrifice", player: 0, zone: 2, cardId: 4 });
  assert.equal(state.players[0].field.filter((m) => m).length, 5, "continua com 5 monstros");
});

test("sacrifício é proibido com zona livre e a zona precisa ter um monstro", () => {
  const free = stateWith(rules, { hand: [[3], []], field: [[mon(rules, 1)], []] });
  assert.throws(() => applyAction(rules, free, play([0], 0)), IllegalActionError);
  const full = stateWith(rules, { hand: [[3], []], field: [fullField(), []] });
  assert.equal(isLegal(rules, full, play([0], 7)), false);
  assert.equal(isLegal(rules, full, play([0], -1)), false);
});

test("a lista legal com o campo cheio oferece uma jogada por zona sacrificável; com zona livre, nenhuma tem sacrifice", () => {
  const full = stateWith(rules, { hand: [[3], []], field: [fullField(), []] });
  const plays = legalActions(rules, full).filter((a): a is PlayAction => a.type === "play");
  assert.ok(plays.length > 0 && plays.every((p) => p.sacrifice !== undefined));
  assert.deepEqual([...new Set(plays.map((p) => p.sacrifice))].sort(), [0, 1, 2, 3, 4]);
  assert.ok(plays.every((p) => isLegal(rules, full, p)));

  const free = stateWith(rules, { hand: [[3], []], field: [[mon(rules, 1)], []] });
  assert.ok(legalActions(rules, free).filter((a) => a.type === "play").every((p) => (p as PlayAction).sacrifice === undefined));
});

test("fusão também pode sacrificar com o campo cheio, e só uma jogada por turno", () => {
  const s = stateWith(rules, { hand: [[5, 6], []], field: [fullField(), []] });
  const { state } = applyAction(rules, s, play([0, 1], 0));
  assert.equal(state.players[0].field[0]!.cardId, 7, "Dragão A + Dragão B = Fusão Dragão");
  assert.ok(state.players[0].graveyard.includes(1) && state.players[0].graveyard.includes(5) && state.players[0].graveyard.includes(6));
  assert.ok(!legalActions(rules, state).some((a) => a.type === "play"), "já jogou neste turno");
});