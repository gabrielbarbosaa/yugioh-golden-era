import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { greedyBot, randomBot, type Bot } from "./bots.ts";
import { actorOf, applyAction, createGame, legalActions } from "./engine.ts";
import { buildRules, type PoolData } from "./pool.ts";
import { makeRandom } from "./rng.ts";
import { randomDeck, viewFor } from "./view.ts";

const data = JSON.parse(readFileSync(new URL("../data/fm-pool.json", import.meta.url), "utf8")) as PoolData;
const rules = buildRules(data);

/** Joga uma partida inteira; falha se o motor lançar erro, se uma ação legal for recusada ou se a partida não acabar. */
function playOut(a: Bot, b: Bot, seed: number) {
  let state = createGame(rules, [randomDeck(rules, seed), randomDeck(rules, seed + 1)], seed);
  const random = makeRandom(seed);
  const bots: [Bot, Bot] = [a, b];
  const used = new Set<string>();
  for (let guard = 0; state.winner === null; guard++) {
    assert.ok(guard < 5000, `a partida ${seed} não terminou`);
    const legal = legalActions(rules, state);
    assert.ok(legal.length > 0, "sempre há uma ação legal enquanto a partida não acabou");
    const actor = actorOf(state);
    const action = bots[actor](rules, state, random);
    const key = JSON.stringify(action);
    assert.ok(legal.some((l) => JSON.stringify(l) === key), `o bot devolveu uma ação fora da lista legal: ${key}`);
    const out = applyAction(rules, state, action);
    for (const e of out.events) used.add(e.type);
    // A visão de ninguém pode vazar a semente nem a ordem do baralho.
    assert.ok(!JSON.stringify(viewFor(out.state, 0)).includes('"rng"'));
    state = out.state;
  }
  return used;
}

test("fuzz: 60 partidas bot x bot com o catálogo real terminam sem erros e usam magias e armadilhas", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    for (const e of playOut(greedyBot, greedyBot, seed)) seen.add(e);
    for (const e of playOut(randomBot, randomBot, seed + 100)) seen.add(e);
    for (const e of playOut(greedyBot, randomBot, seed + 200)) seen.add(e);
  }
  // (Os efeitos de monstros são só 4 cartas em ~1100: ficam para os testes unitários.)
  for (const type of ["spell", "set", "trap", "destroyed", "damage", "end"]) {
    assert.ok(seen.has(type), `nenhum evento "${type}" apareceu nas partidas simuladas`);
  }
});