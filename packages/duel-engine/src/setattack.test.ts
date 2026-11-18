import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction, legalActions } from "./engine.ts";
import { eventsFor, HIDDEN_CARD, viewFor } from "./view.ts";
import { mon, setStars, stateWith, testRules } from "./test-helpers.ts";
import type { Action } from "./types.ts";

const attackAction = (zone: number, target: number | "direct"): Action => ({ type: "attack", zone, target });

test("ataque virado: jogar nessa posição fica escondido do oponente e não ataca no turno em que entrou", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, current: 0, hand: [[3], []] });
  const play: Action = { type: "play", hand: [0], position: "setattack", star: 0 };
  assert.ok(legalActions(rules, s0).some((a) => a.type === "play" && a.position === "setattack"), "a posição está entre as jogadas legais");

  const { state, events } = applyAction(rules, s0, play);
  assert.equal(state.players[0].field.find((m) => m)!.position, "setattack");
  assert.equal(viewFor(state, 1).players[0].field.find((m) => m)!.cardId, null, "o oponente não vê qual carta é");
  assert.equal(viewFor(state, 0).players[0].field.find((m) => m)!.cardId, 3, "o dono vê");
  const seen = eventsFor(events, 1).find((e) => e.type === "play");
  assert.ok(seen && seen.type === "play" && seen.cardId === HIDDEN_CARD, "o evento de jogar também fica escondido");
  assert.ok(!legalActions(rules, state).some((a) => a.type === "attack"), "foi jogado neste turno: ainda não ataca");
});

test("ataque virado: ao atacar o monstro é revelado (flip antes do ataque) e bate com o ATK inteiro", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, current: 0, field: [[mon(rules, 2, "setattack", 0, 1)], []] });
  assert.ok(legalActions(rules, s0).some((a) => a.type === "attack" && a.target === "direct"));

  const { state, events } = applyAction(rules, s0, attackAction(0, "direct"));
  assert.equal(state.players[0].field[0]!.position, "attack");
  assert.equal(state.players[1].lp, 8000 - rules.cards[2]!.atk);
  const types = events.map((e) => e.type);
  assert.ok(types.indexOf("flip") >= 0 && types.indexOf("flip") < types.indexOf("attack"), "revela e depois ataca");
});

test("ataque virado atacado: é revelado e luta como ataque (ATK contra ATK), não como defesa", () => {
  const rules = testRules();
  setStars(rules, 3, ["sun", "sun"]);
  setStars(rules, 4, ["sun", "sun"]);
  const fight = (pos: "attack" | "setattack") => {
    const s = stateWith(rules, { turn: 5, current: 0, field: [[mon(rules, 3, "attack", 0, 1)], [mon(rules, 4, pos, 0, 1)]] });
    return applyAction(rules, s, attackAction(0, 0));
  };
  const open = fight("attack");
  const hidden = fight("setattack");
  assert.deepEqual([hidden.state.players[0].lp, hidden.state.players[1].lp], [open.state.players[0].lp, open.state.players[1].lp]);
  assert.deepEqual(hidden.state.players[1].graveyard, open.state.players[1].graveyard);
  assert.ok(hidden.events.some((e) => e.type === "flip"), "o alvo foi revelado");
  const survivor = hidden.state.players[1].field[0];
  if (survivor) assert.equal(survivor.position, "attack", "se sobreviver, fica em ataque (não vira defesa)");
});

test("ataque virado: pode mudar para defesa ou ataque depois de um turno, e isso revela a carta", () => {
  const rules = testRules();
  const s0 = stateWith(rules, { turn: 5, current: 0, field: [[mon(rules, 3, "setattack", 0, 1)], []] });
  const changes = legalActions(rules, s0).filter((a) => a.type === "changePosition");
  assert.deepEqual(changes.map((a) => (a.type === "changePosition" ? a.position : "")).sort(), ["attack", "defense"]);
  const r = applyAction(rules, s0, { type: "changePosition", zone: 0, position: "defense" });
  assert.equal(r.state.players[0].field[0]!.position, "defense");
  assert.ok(r.events.some((e) => e.type === "flip"));
});
