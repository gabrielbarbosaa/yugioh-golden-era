import { buildRules, type PoolData } from "@golden-era/duel-engine";
import pool from "@golden-era/duel-engine/data/fm-pool.json" with { type: "json" };

import { createDuelServer } from "./server.ts";

const port = Number(process.env.PORT ?? 8787);
const apiUrl = process.env.API_URL ?? "http://localhost:8080/v1";

const server = await createDuelServer({ port, apiUrl, rules: buildRules(pool as PoolData) });
console.log(`servidor de duelo em :${server.port} (API ${apiUrl})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
