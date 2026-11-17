import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildRules, cardCost, recipeKey, resolveFusion, validateDeck, type PoolData } from "./pool.ts";
import { assignStars, starAdvantage } from "./stars.ts";
import { STARS } from "./types.ts";

const data = JSON.parse(readFileSync(new URL("../data/fm-pool.json", import.meta.url), "utf8")) as PoolData;
const rules = buildRules(data);

test("catálogo do modo: monstros de baralho e fusões, todos com ATK, DEF e nível", () => {
  const deckable = data.cards.filter((c) => !c.fusion);
  const fusions = data.cards.filter((c) => c.fusion);
  assert.ok(deckable.length > 1000, `só ${deckable.length} monstros de baralho`);
  assert.ok(fusions.length >= 60);
  for (const c of data.cards) {
    assert.ok(Number.isInteger(c.atk) && c.atk >= 0, c.name);
    assert.ok(Number.isInteger(c.def) && c.def >= 0, c.name);
    assert.ok(Number.isInteger(c.level) && c.level >= 1, c.name);
  }
  assert.equal(new Set(data.cards.map((c) => c.id)).size, data.cards.length, "ids repetidos");
});

test("receitas: todo material e todo resultado existem, o resultado é uma fusão e a receita resolve", () => {
  assert.ok(data.recipes.length >= 60, `só ${data.recipes.length} receitas`);
  for (const r of data.recipes) {
    const result = rules.cards[r.result];
    assert.ok(result?.fusion, `resultado ${r.result} não é uma fusão`);
    assert.ok(r.materials.length >= 2 && r.materials.length <= 3);
    for (const m of r.materials) assert.ok(rules.cards[m], `material ${m} de ${result.name} não existe`);
    assert.equal(resolveFusion(rules, r.materials, r.result)?.id, r.result, result.name);
    // A ordem dos materiais não pode importar.
    assert.equal(resolveFusion(rules, [...r.materials].reverse(), r.result)?.id, r.result, result.name);
  }
});

test("receitas: conjuntos de materiais com mais de um resultado são raros e exigem escolha explícita", () => {
  const seen = new Map<string, Set<number>>();
  for (const r of data.recipes) {
    const key = recipeKey(r.materials);
    seen.set(key, (seen.get(key) ?? new Set()).add(r.result));
  }
  const ambiguous = [...seen].filter(([, results]) => results.size > 1);
  assert.ok(ambiguous.length <= 3, `${ambiguous.length} conjuntos ambíguos`);
  for (const [key, results] of ambiguous) {
    const ids = key.split(",").map(Number);
    assert.equal(resolveFusion(rules, ids), null, "sem escolher o resultado não pode resolver");
    for (const result of results) assert.equal(resolveFusion(rules, ids, result)?.id, result);
  }
});

test("estrelas: duas estrelas diferentes por carta, estáveis e distribuídas por todas as dez", () => {
  const used = new Set<string>();
  for (const c of Object.values(rules.cards)) {
    const [a, b] = c.stars;
    assert.notEqual(a, b, c.name);
    assert.deepEqual(assignStars(c.id, c.attribute), c.stars);
    used.add(a);
    used.add(b);
  }
  assert.equal(used.size, STARS.length, "alguma estrela nunca é usada");
});

test("rodas de estrelas: vantagem é antissimétrica e fecha o ciclo", () => {
  for (const a of STARS) {
    assert.equal(starAdvantage(a, a), 0);
    for (const b of STARS) assert.equal(starAdvantage(a, b) + starAdvantage(b, a), 0);
  }
  assert.equal(starAdvantage("sun", "moon"), 1);
  assert.equal(starAdvantage("mercury", "sun"), 1); // fecha a roda A
  assert.equal(starAdvantage("sun", "venus"), 0); // não vizinhas
  assert.equal(starAdvantage("neptune", "mars"), 1); // fecha a roda B
  assert.equal(starAdvantage("sun", "mars"), 0); // rodas diferentes
});

test("custo: cresce com nível e poder; baralho precisa de 40 cartas, até 3 cópias e sem fusões", () => {
  assert.ok(cardCost({ atk: 3000, def: 2500, level: 8 }) > cardCost({ atk: 1000, def: 800, level: 3 }));
  const cards = Object.values(rules.cards).filter((c) => !c.fusion);
  const deck = Array.from({ length: 40 }, (_, i) => cards[Math.floor(i / 2)]!.id); // 20 cartas x 2
  assert.deepEqual(validateDeck(rules, deck), []);
  const fusion = Object.values(rules.cards).find((c) => c.fusion)!;
  assert.match(validateDeck(rules, [...deck.slice(1), fusion.id]).join(), /fusão/);
});
