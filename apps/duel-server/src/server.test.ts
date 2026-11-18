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

const DECK_ID = "11111111-2222-4333-8444-555555555555";
const rules = buildRules(pool as PoolData);
const monsters = Object.values(rules.cards).filter((c) => !c.fusion).map((c) => c.id);

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
    } else if (req.url === `/v1/decks/${DECK_ID}` && user) {
      // Deck de teste: 2 monstros do modo (3 + 2 cópias), 1 carta que o modo não tem e 1 fusão no Extra.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "Deck de teste", cards: { main: [{ cardId: monsters[0], quantity: 3 }, { cardId: monsters[1], quantity: 2 }, { cardId: 1, quantity: 3 }], extra: [], side: [] } }));
    } else {
      res.writeHead(401).end();
    }
  });
  await new Promise<void>((r) => apiServer.listen(0, r));
  const apiPort = (apiServer.address() as { port: number }).port;
  duel = await createDuelServer({ port: 0, apiUrl: `http://127.0.0.1:${apiPort}/v1`, rules, botDelayMs: 20, corsOrigins: ["http://localhost:8081"] });
  base = `127.0.0.1:${duel.port}`;
});

after(async () => {
  await duel.close();
  await new Promise<void>((r) => apiServer.close(() => r()));
});

async function ticket(token: string, deckId?: string): Promise<string | null> {
  const res = await fetch(`http://${base}/tickets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: deckId ? JSON.stringify({ deckId }) : undefined,
  });
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

async function connect(token: string, room?: string, bot?: boolean, deckId?: string) {
  const c = new Client();
  await c.open();
  c.send({ type: "join", ticket: (await ticket(token, deckId))!, room, bot });
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

test("contra o bot: a partida começa na hora e o bot joga sozinho quando é a vez dele", async () => {
  const ana = await connect("tok-ana", undefined, true);
  const start = await ana.waitFor("start");
  assert.equal(start.opponent, "Bot");
  let st = await ana.waitFor("state");

  // Passa a vez até o bot aparecer nos eventos de turno (ou até a partida acabar).
  for (let round = 0; round < 3; round++) {
    if (st.view.current !== start.you) break;
    const from = ana.messages.length;
    ana.send({ type: "action", action: { type: "endTurn" } });
    // O estado seguinte já é da vez do bot; depois o bot joga e devolve a vez.
    await ana.waitFor("state", from);
    for (let i = 0; i < 200; i++) {
      const last = [...ana.messages].reverse().find((m) => m.type === "state");
      if (last && last.type === "state" && (last.view.current === start.you || last.view.winner !== null) && ana.messages.length - from > 1) {
        st = last;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  const played = ana.messages.filter((m) => m.type === "state").some((m) => m.type === "state" && m.events.some((e) => e.type === "turn" && e.player !== start.you));
  assert.ok(played, "o turno do bot aconteceu");
  ana.ws.close();
});
test("deck da conta: ingresso valida o deck na API e o baralho do duelo usa os monstros dele", async () => {
  // Deck que não existe (ou que a API não mostra a quem pede) não gera ingresso.
  assert.equal(await ticket("tok-ana", "99999999-2222-4333-8444-555555555555"), null);
  assert.equal(await ticket("tok-ana", "nao-e-uuid"), null);

  const ana = await connect("tok-ana", undefined, true, DECK_ID);
  const start = await ana.waitFor("start");
  assert.deepEqual(start.deck, { name: "Deck de teste", used: 5, ignored: 3, filled: 35 });
  const st = await ana.waitFor("state");
  const hand = st.view.players[start.you].hand!;
  assert.equal(hand.length, 5);
  ana.ws.close();

  // Sem deck escolhido, não há relatório.
  const beto = await connect("tok-beto", undefined, true);
  assert.equal((await beto.waitFor("start")).deck, undefined);
  beto.ws.close();
});

test("CORS: só a origem configurada passa na pré-checagem e recebe os cabeçalhos", async () => {
  const pre = await fetch(`http://127.0.0.1:${duel.port}/tickets`, { method: "OPTIONS", headers: { Origin: "http://localhost:8081", "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:8081");
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Authorization/);

  const other = await fetch(`http://127.0.0.1:${duel.port}/healthz`, { headers: { Origin: "http://evil.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});