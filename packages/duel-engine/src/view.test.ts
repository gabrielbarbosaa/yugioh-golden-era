import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "./engine.ts";
import { fillerDeck, mon, stateWith, testRules } from "./test-helpers.ts";
import { validateDeck } from "./pool.ts";
import { eventsFor, HIDDEN_CARD, randomDeck, viewFor } from "./view.ts";
import type { GameEvent } from "./types.ts";

test("viewFor: o dono vê a própria mão; o oponente só vê a contagem", () => {
  const rules = testRules();
  const g = createGame(rules, [fillerDeck(), fillerDeck()], 5);
  const v0 = viewFor(g, 0);
  assert.deepEqual(v0.players[0].hand, g.players[0].hand);
  assert.equal(v0.players[1].hand, null);
  assert.equal(v0.players[1].handCount, 5);
  assert.equal(v0.players[1].deckCount, 35);
  assert.equal(v0.you, 0);

  const v1 = viewFor(g, 1);
  assert.equal(v1.players[0].hand, null);
  assert.deepEqual(v1.players[1].hand, g.players[1].hand);
});

test("viewFor: monstro do oponente virado para baixo fica escondido; o seu e os virados para cima aparecem", () => {
  const rules = testRules();
  const s = stateWith(rules, {
    field: [[mon(rules, 3, "facedown"), mon(rules, 2, "attack")], [mon(rules, 4, "facedown"), mon(rules, 1, "defense")]],
  });
  const v = viewFor(s, 0);
  assert.equal(v.players[0].field[0]!.cardId, 3, "o próprio monstro virado é visível para o dono");
  assert.equal(v.players[1].field[0]!.cardId, null, "o do oponente está escondido");
  assert.equal(v.players[1].field[0]!.star, null);
  assert.equal(v.players[1].field[0]!.position, "facedown", "a posição (e que existe um monstro) continua pública");
  assert.equal(v.players[1].field[1]!.cardId, 1);
});

test("viewFor: nunca expõe a semente nem a ordem do baralho", () => {
  const rules = testRules();
  const g = createGame(rules, [fillerDeck(), fillerDeck()], 5);
  const json = JSON.stringify(viewFor(g, 0));
  assert.ok(!json.includes('"rng"'));
  assert.ok(!json.includes('"deck"'));
});

test("randomDeck: 40 cartas válidas, determinístico pela semente e diferente entre sementes", () => {
  const rules = testRules();
  const a = randomDeck(rules, 11);
  assert.deepEqual(validateDeck(rules, a), []);
  assert.deepEqual(randomDeck(rules, 11), a);
  assert.notDeepEqual(randomDeck(rules, 12), a);
});

test("eventsFor: esconde a compra e a jogada virada do oponente, mas não as suas nem as viradas para cima", () => {
  const events: GameEvent[] = [
    { type: "draw", player: 1, cardId: 7 },
    { type: "draw", player: 0, cardId: 8 },
    { type: "play", player: 1, cardId: 3, zone: 0, position: "facedown", star: "sun", materials: [5, 6] },
    { type: "play", player: 1, cardId: 3, zone: 1, position: "attack", star: "sun", materials: [] },
    { type: "attack", player: 1, zone: 1, target: "direct" },
  ];
  const seen = eventsFor(events, 0);
  assert.deepEqual(seen[0], { type: "draw", player: 1, cardId: HIDDEN_CARD });
  assert.deepEqual(seen[1], events[1]);
  assert.deepEqual(seen[2], { type: "play", player: 1, cardId: HIDDEN_CARD, zone: 0, position: "facedown", star: null, materials: [] });
  assert.deepEqual(seen[3], events[3]);
  assert.deepEqual(seen[4], events[4]);
  // O jogador 1 vê os próprios eventos sem alteração (e a compra do jogador 0 fica escondida para ele).
  assert.deepEqual(eventsFor([events[0]!, events[2]!], 1), [events[0], events[2]]);
  assert.deepEqual(eventsFor([events[1]!], 1), [{ type: "draw", player: 0, cardId: HIDDEN_CARD }]);
});