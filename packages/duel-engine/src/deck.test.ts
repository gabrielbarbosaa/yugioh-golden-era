import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeck } from "./deck.ts";
import { validateDeck } from "./pool.ts";
import { testRules } from "./test-helpers.ts";

test("buildDeck: usa os monstros do deck, ignora o que o modo não tem e completa até 40", () => {
  const rules = testRules();
  const { deck, report } = buildDeck(
    rules,
    [
      { cardId: 1, quantity: 3 },
      { cardId: 2, quantity: 2 },
      { cardId: 7, quantity: 1 }, // fusão: fora
      { cardId: 99999, quantity: 3 }, // magia/armadilha ou carta fora do modo: fora
    ],
    42,
  );
  assert.deepEqual(validateDeck(rules, deck), []);
  assert.equal(deck.length, 40);
  assert.deepEqual(report, { used: 5, ignored: 4, filled: 35 });
  assert.equal(deck.filter((id) => id === 1).length >= 3, true);
  assert.deepEqual(deck.slice(0, 5), [1, 1, 1, 2, 2], "as cartas do deck vêm primeiro, na ordem");
});

test("buildDeck: limita a 3 cópias e a 40 cartas", () => {
  const rules = testRules();
  const many = Array.from({ length: 20 }, (_, i) => ({ cardId: 101 + i, quantity: 3 })); // 60 cartas
  const { deck, report } = buildDeck(rules, [{ cardId: 1, quantity: 9 }, ...many], 1);
  assert.deepEqual(validateDeck(rules, deck), []);
  assert.equal(deck.filter((id) => id === 1).length, 3);
  assert.equal(report.used, 40);
  assert.equal(report.filled, 0);
  assert.equal(report.ignored, 9 + 60 - 40);
});

test("buildDeck: deck vazio vira baralho aleatório válido e é determinístico pela semente", () => {
  const rules = testRules();
  const a = buildDeck(rules, [], 7);
  assert.deepEqual(validateDeck(rules, a.deck), []);
  assert.deepEqual(buildDeck(rules, [], 7), a);
  assert.notDeepEqual(buildDeck(rules, [], 8).deck, a.deck);
  assert.deepEqual(a.report, { used: 0, ignored: 0, filled: 40 });
});