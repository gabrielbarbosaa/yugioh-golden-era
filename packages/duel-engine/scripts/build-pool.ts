/**
 * Gera `data/fm-pool.json` a partir da API do Golden Era (precisa estar rodando):
 *
 *   npm run build-pool -w @golden-era/duel-engine          # API em http://localhost:8080/v1
 *   API_URL=http://host:8080/v1 npm run build-pool -w ...
 *
 * - Baralho: todos os monstros que não são de fusão. Os efeitos dos monstros ficam DESLIGADOS (só valem ATK, DEF,
 *   nível, atributo e espécie), exceto os poucos listados em src/effects.ts.
 * - Suporte: as magias e armadilhas de src/effects.ts (SPELLS/TRAPS), procuradas pelo nome.
 * - Fusões: os monstros de fusão, com a receita lida do início do texto (`"A" + "B" [+ "C"]`).
 *   Receitas genéricas ("5 Dragon monsters") e as que citam cartas fora do catálogo são listadas em `skipped`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MONSTER_EFFECTS, SPELLS, TRAPS } from "../src/effects.ts";

const API_URL = process.env.API_URL ?? "http://localhost:8080/v1";

interface ApiCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number | null;
  def?: number | null;
  level?: number | null;
  race?: string | null;
  attribute?: string | null;
}

async function fetchAll(): Promise<ApiCard[]> {
  const all: ApiCard[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${API_URL}/cards`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    const page = (await res.json()) as { items: ApiCard[]; nextCursor?: string | null };
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

const isMonster = (c: ApiCard) => c.type.includes("Monster");
// O catálogo usa -1 para "?" (ATK/DEF que dependem de efeito); essas cartas ficam de fora do modo.
const complete = (c: ApiCard) => c.atk != null && c.def != null && c.level != null && c.atk >= 0 && c.def >= 0;

const all = await fetchAll();
const variableStats = all.filter((c) => isMonster(c) && c.atk != null && c.def != null && (c.atk < 0 || c.def < 0)).map((c) => c.name);
const monsters = all.filter((c) => isMonster(c) && complete(c));
const deckable = monsters.filter((c) => c.type !== "Fusion Monster");
const fusions = monsters.filter((c) => c.type === "Fusion Monster");

const byName = new Map<string, ApiCard[]>();
for (const c of monsters) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);

const recipes: { result: number; materials: number[] }[] = [];
const skipped: { generic: string[]; unresolved: { name: string; missing: string[] }[]; variableStats: string[] } = {
  generic: [],
  unresolved: [],
  variableStats,
};

for (const f of fusions) {
  // O texto começa com as receitas: "A" + "B" (+ "C"...). Qualquer outra coisa é uma receita genérica.
  const head = /^\s*(?:"[^"]+"\s*\+\s*)+"[^"]+"/.exec(f.desc);
  if (!head) {
    skipped.generic.push(f.name);
    continue;
  }
  const names = [...head[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  const ids: number[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const found = byName.get(n);
    if (found && found.length === 1) ids.push(found[0]!.id);
    else missing.push(n);
  }
  if (missing.length > 0) skipped.unresolved.push({ name: f.name, missing });
  else recipes.push({ result: f.id, materials: ids });
}

const pick = (c: ApiCard, fusion: boolean) => ({
  id: c.id,
  name: c.name,
  fusion,
  atk: c.atk!,
  def: c.def!,
  level: c.level!,
  attribute: c.attribute ?? null,
  race: c.race ?? null,
});

const support: { id: number; name: string; kind: "spell" | "trap" }[] = [];
const missingSupport: string[] = [];
for (const [names, kind, type] of [[SPELLS, "spell", "Spell Card"], [TRAPS, "trap", "Trap Card"]] as const) {
  for (const name of Object.keys(names)) {
    const found = all.filter((c) => c.name === name && c.type === type);
    if (found.length === 1) support.push({ id: found[0]!.id, name, kind });
    else missingSupport.push(name);
  }
}
const missingMonsterEffects = Object.keys(MONSTER_EFFECTS).filter((n) => !deckable.some((c) => c.name === n));

const data = {
  source: `GET ${API_URL}/cards`,
  note: "Efeitos desligados: só os números de combate. Estrelas e custo são derivados ao carregar (src/stars.ts, src/pool.ts).",
  cards: [...deckable.map((c) => pick(c, false)), ...fusions.map((c) => pick(c, true))],
  recipes,
  support,
  skipped,
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../data/fm-pool.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data) + "\n");

console.log(`cartas da API: ${all.length}`);
console.log(`monstros de baralho: ${deckable.length} | fusões: ${fusions.length}`);
console.log(`monstros sem ATK/DEF fixo (fora do modo): ${variableStats.length}`);
console.log(`receitas utilizáveis: ${recipes.length} | genéricas ignoradas: ${skipped.generic.length} | com material fora do catálogo: ${skipped.unresolved.length}`);
console.log(`magias/armadilhas do modo: ${support.length}${missingSupport.length ? ` (não achadas: ${missingSupport.join(", ")})` : ""}`);
if (missingMonsterEffects.length) console.log(`efeitos de monstros sem carta no catálogo: ${missingMonsterEffects.join(", ")}`);
console.log(`gravado em ${out}`);
