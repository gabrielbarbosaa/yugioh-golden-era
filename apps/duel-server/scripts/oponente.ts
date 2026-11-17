// Oponente de teste manual: entra numa sala e joga a primeira ação legal da sua vez.
// Uso: node scripts/oponente.ts <SALA> <email> <senha>   (API_URL e DUEL_URL têm padrão local)
import { WebSocket } from "ws";

import type { ServerMessage } from "@golden-era/duel-engine";

const [room, email, password] = process.argv.slice(2);
if (!room || !email || !password) throw new Error("uso: oponente.ts <SALA> <email> <senha>");
const api = process.env.API_URL ?? "http://localhost:8080/v1";
const duel = process.env.DUEL_URL ?? "localhost:8787";

const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { accessToken } = (await login.json()) as { accessToken: string };
const { ticket } = (await (await fetch(`http://${duel}/tickets`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } })).json()) as {
  ticket: string;
};

const ws = new WebSocket(`ws://${duel}`);
ws.on("open", () => ws.send(JSON.stringify({ type: "join", ticket, room })));
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString()) as ServerMessage;
  console.log(m.type, m.type === "state" ? `turno ${m.view.turn}, vez de ${m.view.current}` : "");
  if (m.type === "state" && m.legal.length && m.view.winner === null) {
    // Prefere jogar/atacar; só encerra o turno quando não há outra ação.
    const action = m.legal.find((a) => a.type !== "endTurn" && a.type !== "changePosition") ?? m.legal[0]!;
    setTimeout(() => ws.send(JSON.stringify({ type: "action", action })), 600);
  }
});
