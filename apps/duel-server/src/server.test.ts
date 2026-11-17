import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { buildRules, type ClientMessage, type PoolData, type ServerMessage } from "@golden-era/duel-engine";
import pool from "@golden-era/duel-engine/data/fm-pool.json" with { type: "json" };
import { WebSocket } from "ws";

import { createDuelServer } from "./server.ts";

const users: Record<string, { id: string; username: string }> = {
  "tok-ana": { id: "u1", username: "ana" },
  "tok-beto": { id: "u2", username: "beto" },
  "tok-caio": { id: "u3", username: "caio" },
};

let apiServer: ReturnType<typeof createServer>;
let duel: Awaited<ReturnType<typeof createDuelServer>>;
let base = "";

before(async () => {
  // API simulada: só o GET /me.
  apiServer = createServer((req, res) => {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    const user = users[token];
    if (req.url === "/v1/me" && user) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(user));
    } else {
      res.writeHead(401).end();
    }
  });
  await new Promise<void>((r) => apiServer.listen(0, r));
  const apiPort = (apiServer.address() as { port: number }).port;
  duel = await createDuelServer({ port: 0, apiUrl: `http://127.0.0.1:${apiPort}/v1`, rules: buildRules(pool as PoolData) });
  base = `127.0.0.1:${duel.port}`;
});

after(async () => {
  await duel.close();
  await new Promise<void>((r) => apiServer.close(() => r()));
});

async function ticket(token: string): Promise<string | null> {
  const res = await fetch(`http://${base}/tickets`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? ((await res.json()) as { ticket: string }).ticket : null;
}

class Client {
  messages: ServerMessage[] = [];
  closed = false;
  ws: WebSocket;
  constructor() {
    this.ws = new WebSocket(`ws://${base}`);
    this.ws.on("message", (d) => this.messages.push(JSON.parse(d.toString()) as ServerMessage));
    this.ws.on("close", () => (this.closed = true));
  }
  open() {
    return new Promise<void>((r) => this.ws.once("open", () => r()));
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMessage["type"]>(type: T, from = 0): Promise<Extract<ServerMessage, { type: T }>> {
    for (let i = 0; i < 200; i++) {
      const m = this.messages.slice(from).find((x) => x.type === type);
      if (m) return m as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`não recebeu ${type}; recebeu ${JSON.stringify(this.messages.map((m) => m.type))}`);
  }
}

async function connect(token: string, room?: string) {
  const c = new Client();
  await c.open();
  c.send({ type: "join", ticket: (await ticket(token))!, room });
  return c;
}

test("ingresso: token inválido recebe 401", async () => {
  assert.equal(await ticket("tok-errado"), null);
});

test("ingresso de uso único: reutilizar é recusado", async () => {
  const t = (await ticket("tok-ana"))!;
  const a = new Client();
  await a.open();
  a.send({ type: "join", ticket: t });
  await a.waitFor("waiting");
  const b = new Client();
  await b.open();
  b.send({ type: "join", ticket: t });
  const err = await b.waitFor("error");
  assert.equal(err.fatal, true);
  a.ws.close();
});

test("dois jogadores: sala, início, visões separadas e ações validadas pelo servidor", async () => {
  const ana = await connect("tok-ana");
  const { room } = await ana.waitFor("waiting");
  assert.match(room, /^[A-Z2-9]{4}$/);

  const beto = await connect("tok-beto", room);
  const startA = await ana.waitFor("start");
  const startB = await beto.waitFor("start");
  assert.equal(startA.opponent, "beto");
  assert.equal(startB.opponent, "ana");
  assert.notEqual(startA.you, startB.you);

  const stA = await ana.waitFor("state");
  const stB = await beto.waitFor("state");
  const [first, second] = startA.you === stA.view.current ? [ana, beto] : [beto, ana];
  const firstState = startA.you === stA.view.current ? stA : stB;
  const secondState = first === ana ? stB : stA;

  // Cada um vê a própria mão e só a contagem da do outro; ninguém recebe a ordem do baralho.
  for (const [st, me] of [[stA, startA.you], [stB, startB.you]] as const) {
    assert.ok(st.view.players[me].hand);
    assert.equal(st.view.players[me === 0 ? 1 : 0].hand, null);
  }
  assert.ok(!JSON.stringify([stA, stB]).includes('"rng"'));
  assert.ok(firstState.legal.length > 0);
  assert.deepEqual(secondState.legal, []);

  // Fora da vez: recusado, sem mudar o estado.
  const before = second.messages.length;
  second.send({ type: "action", action: firstState.legal[0]! });
  assert.equal((await second.waitFor("error", before)).message, "não é a sua vez");

  // Na vez: aceito, e os dois recebem o novo estado.
  const nA = ana.messages.length;
  const nB = beto.messages.length;
  first.send({ type: "action", action: firstState.legal[0]! });
  await ana.waitFor("state", nA);
  await beto.waitFor("state", nB);

  ana.ws.close();
  beto.ws.close();
});

test("reconexão: quem volta à sala reassume o mesmo lugar e recebe a mesa", async () => {
  const ana = await connect("tok-ana");
  const { room } = await ana.waitFor("waiting");
  const beto = await connect("tok-beto", room);
  const startA = await ana.waitFor("start");
  await beto.waitFor("state");

  ana.ws.close();
  assert.equal((await beto.waitFor("opponent")).status, "disconnected");

  const ana2 = await connect("tok-ana", room);
  const again = await ana2.waitFor("start");
  assert.equal(again.you, startA.you);
  await ana2.waitFor("state");
  ana2.ws.close();
  beto.ws.close();
});

test("sala cheia e sala inexistente são recusadas", async () => {
  const ana = await connect("tok-ana");
  const { room } = await ana.waitFor("waiting");
  const beto = await connect("tok-beto", room);
  await beto.waitFor("start");
  const caio = await connect("tok-caio", room);
  assert.equal((await caio.waitFor("error")).message, "sala cheia");
  const caio2 = await connect("tok-caio", "ZZZZ");
  assert.equal((await caio2.waitFor("error")).message, "sala não encontrada");
  ana.ws.close();
  beto.ws.close();
});
