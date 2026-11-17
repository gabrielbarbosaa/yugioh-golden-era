/**
 * Simulações de equilíbrio com o catálogo real (`data/fm-pool.json`):
 *
 *   npm run simulate -w @golden-era/duel-engine            # N=300 partidas por célula
 *   N=1000 SEED=7 npm run simulate -w @golden-era/duel-engine
 *
 * Responde, com números, a perguntas como: a vantagem de jogar primeiro é grande? o bot esperto vence o aleatório?
 * sem teto de custo o melhor baralho domina? as fusões compensam? A saída é Markdown (também gravada em data/sim-report.md).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { greedyBot, randomBot, type Bot } from "../src/bots.ts";
import { applyAction, createGame } from "../src/engine.ts";
import { buildRules, deckCost, type PoolData } from "../src/pool.ts";
import { makeRandom } from "../src/rng.ts";
import type { Card, Rules } from "../src/types.ts";

const here = new URL("..", import.meta.url);
const data = JSON.parse(readFileSync(new URL("data/fm-pool.json", here), "utf8")) as PoolData;
const rules = buildRules(data);
const N = Number(process.env.N ?? 300);
const SEED = Number(process.env.SEED ?? 1);

const deckable: Card[] = Object.values(rules.cards).filter((c) => !c.fusion);
let byCost = [...deckable].sort((a, b) => a.cost - b.cost);
let cheapest = byCost[0]!.cost;

/** Troca a fórmula de custo (para comparar modelos) e recalcula o que depende dela. */
function setCostModel(fn: (c: Card) => number): void {
  for (const c of Object.values(rules.cards)) c.cost = fn(c);
  byCost = [...deckable].sort((a, b) => a.cost - b.cost);
  cheapest = byCost[0]!.cost;
}
const originalCost = new Map(Object.values(rules.cards).map((c) => [c.id, c.cost]));
const restoreCostModel = () => setCostModel((c) => originalCost.get(c.id)!);

// ------------------------------------------------------------ montadores de baralho

/** Quantas cartas "de elite" (ATK ou DEF >= 2500) cabem no baralho; `Infinity` = sem limite. Alterado nos experimentos. */
let maxElite = Infinity;
const isElite = (c: Card) => Math.max(c.atk, c.def) >= 2500;

/** Tenta pôr até `n` cópias de `id`; só aceita se ainda sobrar orçamento para completar as vagas com as cartas mais baratas. */
function add(deck: number[], id: number, n: number, cap: number | null): void {
  const card = rules.cards[id]!;
  for (let k = 0; k < n && deck.length < rules.deckSize; k++) {
    if (deck.filter((x) => x === id).length >= 3) return;
    if (isElite(card) && deck.filter((x) => isElite(rules.cards[x]!)).length >= maxElite) return;
    const slotsAfter = rules.deckSize - deck.length - 1;
    if (cap !== null && deckCost(rules, deck) + card.cost + cheapest * slotsAfter > cap) return;
    deck.push(id);
  }
}

function fillCheap(deck: number[], cap: number | null): number[] {
  for (const c of byCost) {
    if (deck.length >= rules.deckSize) break;
    add(deck, c.id, 3, cap);
  }
  return deck;
}

function randomDeck(cap: number | null, random: () => number): number[] {
  const ids = deckable.map((c) => c.id).sort(() => random() - 0.5);
  const deck: number[] = [];
  for (const id of ids) {
    if (deck.length >= rules.deckSize) break;
    add(deck, id, 1 + Math.floor(random() * 3), cap);
  }
  return fillCheap(deck, cap);
}

/** O melhor baralho possível sob o teto: cartas com mais poder por ponto de custo, 3 cópias de cada. */
function efficientDeck(cap: number | null): number[] {
  const value = (c: Card) => c.atk + 0.5 * c.def;
  const ranked = [...deckable].sort((a, b) => (cap === null ? value(b) - value(a) : value(b) / b.cost - value(a) / a.cost));
  const deck: number[] = [];
  for (const c of ranked) add(deck, c.id, 3, cap);
  return fillCheap(deck, cap);
}

/**
 * "Curva plana": só cartas que cabem no custo médio do teto (teto / 40), as mais fortes entre elas. Funciona com
 * qualquer fórmula de custo, ao contrário de "poder por custo", que em modelos convexos escolhe só cartas fracas e baratas.
 */
function flatDeck(cap: number | null): number[] {
  const perSlot = cap === null ? byCost[Math.floor(byCost.length / 2)]!.cost : Math.floor(cap / rules.deckSize);
  const deck: number[] = [];
  for (const c of [...deckable].filter((x) => x.cost <= perSlot).sort((a, b) => b.atk + 0.5 * b.def - (a.atk + 0.5 * a.def))) add(deck, c.id, 3, cap);
  return fillCheap(deck, cap);
}

/** Os monstros mais fortes em `score`, até gastar o orçamento: o baralho "sem frescura" de quem só quer números altos. */
function topBy(score: (c: Card) => number, cap: number | null): number[] {
  const deck: number[] = [];
  for (const c of [...deckable].sort((a, b) => score(b) - score(a))) add(deck, c.id, 3, cap);
  return fillCheap(deck, cap);
}

/** Baralho de fusões: 4 receitas de dois materiais (3 cópias de cada material) e o resto aleatório. */
function fusionDeck(cap: number | null, random: () => number): number[] {
  const pairs = data.recipes.filter((r) => r.materials.length === 2 && r.materials.every((m) => rules.cards[m] && !rules.cards[m]!.fusion));
  const deck: number[] = [];
  for (const r of [...pairs].sort(() => random() - 0.5).slice(0, 4)) for (const m of r.materials) add(deck, m, 3, cap);
  const rest = deckable.map((c) => c.id).sort(() => random() - 0.5);
  for (const id of rest) {
    if (deck.length >= rules.deckSize) break;
    add(deck, id, 1 + Math.floor(random() * 3), cap);
  }
  return fillCheap(deck, cap);
}

// ------------------------------------------------------------ partidas

interface Result {
  winner: "A" | "B" | "draw";
  reason: string;
  turns: number;
  fusions: number;
  firstPlayerWon: boolean | null;
}

function playMatch(deckA: number[], deckB: number[], botA: Bot, botB: Bot, seed: number, aFirst: boolean): Result {
  const decks: [number[], number[]] = aFirst ? [deckA, deckB] : [deckB, deckA];
  let state = createGame(rules, decks, seed);
  const random = makeRandom(seed ^ 0x9e3779b9);
  const seatBot: [Bot, Bot] = aFirst ? [botA, botB] : [botB, botA];
  let fusions = 0;
  let guard = 0;
  while (state.winner === null) {
    const action = seatBot[state.current](rules, state, random);
    const out = applyAction(rules, state, action);
    for (const e of out.events) if (e.type === "play" && e.materials.length > 1) fusions++;
    state = out.state;
    if (++guard > 20000) throw new Error("partida sem fim");
  }
  const w = state.winner;
  const seatA = aFirst ? 0 : 1;
  return {
    winner: w === "draw" ? "draw" : w === seatA ? "A" : "B",
    reason: state.reason ?? "?",
    turns: state.turn,
    fusions,
    firstPlayerWon: w === "draw" ? null : w === 0,
  };
}

interface Summary {
  a: number;
  b: number;
  draws: number;
  firstWins: number;
  decided: number;
  turns: number;
  fusionGames: number;
  reasons: Record<string, number>;
  n: number;
}

/** `makeA`/`makeB` montam um baralho novo por partida; cada par joga duas vezes trocando quem começa. */
function simulate(label: string, makeA: (r: () => number) => number[], makeB: (r: () => number) => number[], botA: Bot, botB: Bot): Summary & { label: string } {
  const s: Summary = { a: 0, b: 0, draws: 0, firstWins: 0, decided: 0, turns: 0, fusionGames: 0, reasons: {}, n: 0 };
  const random = makeRandom(SEED * 1000 + label.length);
  for (let i = 0; i < N; i++) {
    const deckA = makeA(random);
    const deckB = makeB(random);
    const seed = SEED * 100000 + i;
    const r = playMatch(deckA, deckB, botA, botB, seed, i % 2 === 0);
    s.n++;
    s.turns += r.turns;
    s.fusionGames += r.fusions > 0 ? 1 : 0;
    s.reasons[r.reason] = (s.reasons[r.reason] ?? 0) + 1;
    if (r.winner === "A") s.a++;
    else if (r.winner === "B") s.b++;
    else s.draws++;
    if (r.firstPlayerWon !== null) {
      s.decided++;
      if (r.firstPlayerWon) s.firstWins++;
    }
  }
  return { label, ...s };
}

const pct = (x: number, n: number) => (n === 0 ? "-" : `${((100 * x) / n).toFixed(1)}%`);
const lines: string[] = [];
const out = (l = "") => {
  lines.push(l);
  console.log(l);
};

// ------------------------------------------------------------ relatório

const costs = deckable.map((c) => c.cost).sort((a, b) => a - b);
const q = (p: number) => costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]!;
const meanCost = costs.reduce((a, b) => a + b, 0) / costs.length;
const randomCost = (() => {
  const r = makeRandom(SEED);
  let sum = 0;
  for (let i = 0; i < 200; i++) sum += deckCost(rules, randomDeck(null, r));
  return Math.round(sum / 200);
})();
const strongestCost = deckCost(rules, efficientDeck(null));

out(`# Relatório de equilíbrio (N=${N} por linha, semente ${SEED})`);
out();
out(`Catálogo: ${deckable.length} monstros de baralho, ${Object.values(rules.cards).length - deckable.length} fusões, ${data.recipes.length} receitas.`);
out();
out("## Custos");
out();
out(`- Custo de uma carta: mín ${costs[0]}, mediana ${q(0.5)}, p90 ${q(0.9)}, máx ${costs[costs.length - 1]}, média ${meanCost.toFixed(1)}.`);
out(`- Baralho aleatório sem teto: custo médio ~${randomCost}. Baralho "mais forte" sem teto: ${strongestCost}.`);
out();

const rnd = (cap: number | null) => (r: () => number) => randomDeck(cap, r);
const strong = (cap: number | null) => () => efficientDeck(cap);

out("## 1. Sanidade do jogo (baralhos aleatórios, sem teto)");
out();
out("| Confronto | A vence | B vence | Empates | 1º jogador vence | Turnos (média) | Com fusão | Fim por vida / baralho / limite |");
out("|---|---|---|---|---|---|---|---|");
for (const [label, ba, bb] of [
  ["esperto x esperto", greedyBot, greedyBot],
  ["esperto (A) x aleatório (B)", greedyBot, randomBot],
] as const) {
  const r = simulate(label, rnd(null), rnd(null), ba, bb);
  out(`| ${label} | ${pct(r.a, r.n)} | ${pct(r.b, r.n)} | ${pct(r.draws, r.n)} | ${pct(r.firstWins, r.decided)} | ${(r.turns / r.n).toFixed(1)} | ${pct(r.fusionGames, r.n)} | ${r.reasons.lp ?? 0} / ${r.reasons["deck-out"] ?? 0} / ${r.reasons["turn-limit"] ?? 0} |`);
}
out();

out("## 2. Todos contra todos: cinco estilos de baralho sob o mesmo teto de custo");
out();
out("Cada par joga N partidas (alternando quem começa) com o bot esperto dos dois lados. Estilos: **Poder** (maior ATK), **Curva plana** (só cartas que cabem no custo médio do teto), **Muralha** (maior DEF), **Fusão** (4 receitas + resto aleatório) e **Aleatório**.");
out("Um teto equilibrado deixa todos os estilos perto de 50%; um estilo muito acima dos demais domina o jogo. (Sem teto, a Curva plana é só a metade mais fraca do catálogo e não é comparável.)");
out();

const styles: { name: string; make: (cap: number | null, r: () => number) => number[] }[] = [
  { name: "Poder", make: (cap) => topBy((c) => c.atk, cap) },
  { name: "Curva plana", make: (cap) => flatDeck(cap) },
  { name: "Muralha", make: (cap) => topBy((c) => c.def, cap) },
  { name: "Fusão", make: (cap, r) => fusionDeck(cap, r) },
  { name: "Aleatório", make: (cap, r) => randomDeck(cap, r) },
];
const pairN = Math.max(60, Math.floor(N / 2));

/** Round-robin dos cinco estilos sob um teto; devolve a taxa de vitória de cada um. */
function roundRobin(cap: number | null): { rates: Record<string, number>; costs: Record<string, number>; stats: { w: number; l: number; d: number }[]; costList: number[] } {
  const stats = styles.map(() => ({ w: 0, l: 0, d: 0 }));
  const costList: number[] = styles.map((s) => deckCost(rules, s.make(cap, makeRandom(SEED))));
  for (let i = 0; i < styles.length; i++) {
    for (let j = i + 1; j < styles.length; j++) {
      const sa = styles[i]!;
      const sb = styles[j]!;
      const random = makeRandom(SEED * 777 + i * 10 + j);
      for (let g = 0; g < pairN; g++) {
        const r = playMatch(sa.make(cap, random), sb.make(cap, random), greedyBot, greedyBot, SEED * 50000 + i * 1000 + j * 100 + g, g % 2 === 0);
        if (r.winner === "A") (stats[i]!.w++, stats[j]!.l++);
        else if (r.winner === "B") (stats[j]!.w++, stats[i]!.l++);
        else (stats[i]!.d++, stats[j]!.d++);
      }
    }
  }
  const rates: Record<string, number> = {};
  const costs: Record<string, number> = {};
  styles.forEach((s, k) => {
    rates[s.name] = stats[k]!.w / (stats[k]!.w + stats[k]!.l + stats[k]!.d);
    costs[s.name] = costList[k]!;
  });
  return { rates, costs, stats, costList };
}

const rounds: { cap: number | null; spread: number }[] = [];
for (const cap of [null, 500, 420, 360, 320] as (number | null)[]) {
  const { rates, stats, costList } = roundRobin(cap);
  rounds.push({ cap, spread: Math.max(...Object.values(rates)) - Math.min(...Object.values(rates)) });
  out(`### Teto ${cap ?? "sem teto"}`);
  out();
  out("| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |");
  out("|---|---|---|---|---|---|");
  styles.forEach((s, k) => {
    const st = stats[k]!;
    out(`| ${s.name} | ${costList[k]} | ${st.w} | ${st.l} | ${st.d} | ${pct(st.w, st.w + st.l + st.d)} |`);
  });
  out();
}out("### Resumo: diferença entre o melhor e o pior estilo, por teto");
out();
out("| Teto | Melhor − pior (pontos percentuais) |");
out("|---|---|");
for (const r of rounds) out(`| ${r.cap ?? "sem teto"} | ${(r.spread * 100).toFixed(1)} |`);
out();
out("## 3. Modelos de custo (comparação)");
out();
out("O custo atual (modelo 1) é linear no nível e no ATK/DEF. Abaixo, modelos mais **convexos** (o poder alto fica proporcionalmente mais caro) e três tetos por modelo, escolhidos como 40 x o custo de uma carta no percentil indicado.");
out("O que se procura: os estilos otimizados (Poder, Curva plana, Muralha) perto uns dos outros, sem um deles dominar.");
out();
const power = (c: Card) => c.atk + 0.5 * c.def;
const models: { name: string; fn: (c: Card) => number }[] = [
  { name: "1 linear (atual)", fn: (c) => 1 + c.level + Math.floor(Math.max(c.atk, c.def) / 400) },
  { name: "2 convexo p=1.6", fn: (c) => Math.max(1, Math.ceil(Math.pow(power(c) / 500, 1.6))) },
  { name: "3 convexo p=2.0", fn: (c) => Math.max(1, Math.ceil(Math.pow(power(c) / 600, 2))) },
  { name: "4 só estatística (max/250)", fn: (c) => Math.max(1, Math.ceil(Math.max(c.atk, c.def) / 250)) },
  { name: "5 ATK + DEF/2 (÷300)", fn: (c) => Math.max(1, Math.ceil(power(c) / 300)) },
];
out("| Modelo | Percentil | Teto | Poder | Curva plana | Muralha | Fusão | Aleatório | Spread otimizados (pp) |");
out("|---|---|---|---|---|---|---|---|---|");
const modelResults: { model: string; pctile: number; cap: number; spread: number }[] = [];
for (const m of models) {
  setCostModel(m.fn);
  const sorted = deckable.map((c) => c.cost).sort((a, b) => a - b);
  for (const pctile of [0.5, 0.65, 0.8]) {
    const cap = 40 * sorted[Math.floor(pctile * (sorted.length - 1))]!;
    const { rates } = roundRobin(cap);
    const opt = [rates.Poder!, rates["Curva plana"]!, rates.Muralha!];
    const spread = (Math.max(...opt) - Math.min(...opt)) * 100;
    modelResults.push({ model: m.name, pctile, cap, spread });
    const f = (x: number) => `${(x * 100).toFixed(0)}%`;
    out(`| ${m.name} | p${Math.round(pctile * 100)} | ${cap} | ${f(rates.Poder!)} | ${f(rates["Curva plana"]!)} | ${f(rates.Muralha!)} | ${f(rates["Fusão"]!)} | ${f(rates["Aleatório"]!)} | ${spread.toFixed(1)} |`);
  }
}
restoreCostModel();
out();
out("## 4. Limite de cartas de elite (ATK ou DEF >= 2500) por baralho, sem teto de custo");
out();
out(`Cartas de elite no catálogo: ${deckable.filter(isElite).length} de ${deckable.length}. Cada linha limita quantas delas cabem no baralho.`);
out();
out("| Máx. elite | Poder | Curva plana | Muralha | Fusão | Aleatório | Spread otimizados (pp) |");
out("|---|---|---|---|---|---|---|");
for (const limit of [Infinity, 12, 6, 3, 0]) {
  maxElite = limit;
  const { rates } = roundRobin(null);
  const opt = [rates.Poder!, rates["Curva plana"]!, rates.Muralha!];
  const f = (x: number) => `${(x * 100).toFixed(0)}%`;
  out(`| ${limit === Infinity ? "sem limite" : limit} | ${f(rates.Poder!)} | ${f(rates["Curva plana"]!)} | ${f(rates.Muralha!)} | ${f(rates["Fusão"]!)} | ${f(rates["Aleatório"]!)} | ${((Math.max(...opt) - Math.min(...opt)) * 100).toFixed(1)} |`);
}
maxElite = Infinity;
out();
writeFileSync(new URL("data/sim-report.md", here), lines.join("\n") + "\n");
