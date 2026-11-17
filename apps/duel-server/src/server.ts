import { randomBytes, randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  applyAction,
  createGame,
  eventsFor,
  IllegalActionError,
  legalActions,
  randomDeck,
  viewFor,
  type CardInfo,
  type ClientMessage,
  type GameEvent,
  type GameState,
  type PlayerIndex,
  type Rules,
  type ServerMessage,
} from "@golden-era/duel-engine";
import { WebSocketServer, type WebSocket } from "ws";

export interface DuelServerOptions {
  /** Porta (0 = qualquer livre; veja `port` no retorno). */
  port: number;
  /** URL da API do Golden Era com o prefixo /v1; usada para saber quem é o dono de um token (GET /me). */
  apiUrl: string;
  rules: Rules;
  /** Validade de um ingresso de entrada. */
  ticketTtlMs?: number;
  /** Salas inativas (sem ninguém conectado) são removidas depois deste tempo. */
  roomIdleMs?: number;
  maxRooms?: number;
}

interface User {
  id: string;
  username: string;
}

interface Seat {
  user: User;
  ws: WebSocket | null;
}

interface Room {
  code: string;
  seats: [Seat | null, Seat | null];
  state: GameState | null;
  cards: Record<number, CardInfo>;
  lastActivity: number;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem caracteres que se confundem (0/O, 1/I)

function send(ws: WebSocket | null, message: ServerMessage): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

/** Dados públicos das cartas que podem aparecer na mesa: as dos dois baralhos e todas as fusões. */
function catalogFor(rules: Rules, decks: number[][]): Record<number, CardInfo> {
  const ids = new Set<number>(decks.flat());
  for (const c of Object.values(rules.cards)) if (c.fusion) ids.add(c.id);
  const out: Record<number, CardInfo> = {};
  for (const id of ids) {
    const c = rules.cards[id];
    if (c) out[id] = { id: c.id, name: c.name, atk: c.atk, def: c.def, level: c.level, attribute: c.attribute, race: c.race, stars: c.stars, fusion: c.fusion };
  }
  return out;
}

export async function createDuelServer(options: DuelServerOptions): Promise<{ port: number; close(): Promise<void> }> {
  const { rules, apiUrl } = options;
  const ticketTtl = options.ticketTtlMs ?? 30_000;
  const roomIdle = options.roomIdleMs ?? 10 * 60_000;
  const maxRooms = options.maxRooms ?? 500;

  const tickets = new Map<string, { user: User; expires: number }>();
  const rooms = new Map<string, Room>();

  // ---------------------------------------------------------------- HTTP (ingressos)

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  /** Quem é o dono do token? Pergunta à API (a única que conhece as contas); `null` se o token não vale. */
  async function whoIs(authorization: string | undefined): Promise<User | null> {
    if (!authorization?.startsWith("Bearer ")) return null;
    try {
      const res = await fetch(`${apiUrl}/me`, { headers: { Authorization: authorization } });
      if (!res.ok) return null;
      const me = (await res.json()) as { id?: string; username?: string };
      return me.id && me.username ? { id: me.id, username: me.username } : null;
    } catch {
      return null;
    }
  }

  async function onHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { status: "ok", rooms: rooms.size });
    if (req.method === "POST" && url.pathname === "/tickets") {
      const user = await whoIs(req.headers.authorization);
      if (!user) return json(res, 401, { error: "token inválido" });
      const ticket = randomBytes(24).toString("base64url");
      tickets.set(ticket, { user, expires: Date.now() + ticketTtl });
      return json(res, 200, { ticket });
    }
    json(res, 404, { error: "não encontrado" });
  }

  const http: Server = createServer((req, res) => {
    onHttp(req, res).catch(() => json(res, 500, { error: "erro interno" }));
  });

  // ---------------------------------------------------------------- salas

  function newRoomCode(): string {
    for (;;) {
      const code = Array.from({ length: 4 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]!).join("");
      if (!rooms.has(code)) return code;
    }
  }

  function seatOf(room: Room, ws: WebSocket): PlayerIndex | null {
    const i = room.seats.findIndex((s) => s?.ws === ws);
    return i === 0 || i === 1 ? i : null;
  }

  function sendState(room: Room, events: GameEvent[]) {
    if (!room.state) return;
    for (const i of [0, 1] as const) {
      const seat = room.seats[i];
      if (!seat?.ws) continue;
      const legal = room.state.current === i ? legalActions(rules, room.state) : [];
      send(seat.ws, { type: "state", view: viewFor(room.state, i), legal, events: eventsFor(events, i) });
    }
  }

  function startGameIfReady(room: Room) {
    if (room.state || !room.seats[0] || !room.seats[1]) return;
    const decks = [randomDeck(rules, randomInt(2 ** 31)), randomDeck(rules, randomInt(2 ** 31))] as [number[], number[]];
    room.cards = catalogFor(rules, decks);
    room.state = createGame(rules, decks, randomInt(2 ** 31));
    for (const i of [0, 1] as const) {
      const seat = room.seats[i]!;
      const foe = room.seats[i === 0 ? 1 : 0]!;
      send(seat.ws, { type: "start", room: room.code, you: i, opponent: foe.user.username, cards: room.cards });
    }
    sendState(room, []);
  }

  function join(ws: WebSocket, msg: Extract<ClientMessage, { type: "join" }>): Room | null {
    const t = tickets.get(msg.ticket);
    tickets.delete(msg.ticket); // de uso único, aceito ou não
    if (!t || t.expires < Date.now()) {
      send(ws, { type: "error", message: "ingresso inválido ou expirado; recarregue a página", fatal: true });
      return null;
    }

    let room: Room | undefined;
    if (msg.room) {
      room = rooms.get(msg.room.toUpperCase());
      if (!room) {
        send(ws, { type: "error", message: "sala não encontrada", fatal: true });
        return null;
      }
    } else {
      if (rooms.size >= maxRooms) {
        send(ws, { type: "error", message: "servidor cheio, tente em instantes", fatal: true });
        return null;
      }
      room = { code: newRoomCode(), seats: [null, null], state: null, cards: {}, lastActivity: Date.now() };
      rooms.set(room.code, room);
    }

    // Quem já tem lugar na sala volta para ele (reconexão); senão pega o primeiro assento livre.
    let idx = room.seats.findIndex((s) => s?.user.id === t.user.id);
    if (idx >= 0) {
      const seat = room.seats[idx]!;
      if (seat.ws && seat.ws !== ws) seat.ws.close(4000, "substituída por outra conexão");
      seat.ws = ws;
    } else {
      idx = room.seats.findIndex((s) => s === null);
      if (idx < 0) {
        send(ws, { type: "error", message: "sala cheia", fatal: true });
        return null;
      }
      room.seats[idx] = { user: t.user, ws };
    }
    room.lastActivity = Date.now();

    const foe = room.seats[idx === 0 ? 1 : 0];
    if (foe?.ws) send(foe.ws, { type: "opponent", status: "connected" });

    if (room.state) {
      // Reconexão no meio da partida: reenvia a mesa inteira.
      send(ws, { type: "start", room: room.code, you: idx as PlayerIndex, opponent: foe?.user.username ?? "?", cards: room.cards });
      sendState(room, []);
    } else if (room.seats[0] && room.seats[1]) {
      startGameIfReady(room);
    } else {
      send(ws, { type: "waiting", room: room.code });
    }
    return room;
  }

  function onAction(room: Room, ws: WebSocket, msg: Extract<ClientMessage, { type: "action" }>) {
    const seat = seatOf(room, ws);
    if (seat === null || !room.state) return send(ws, { type: "error", message: "a partida ainda não começou" });
    if (room.state.winner !== null) return send(ws, { type: "error", message: "a partida já terminou" });
    if (room.state.current !== seat) return send(ws, { type: "error", message: "não é a sua vez" });
    try {
      const { state, events } = applyAction(rules, room.state, msg.action);
      room.state = state;
      room.lastActivity = Date.now();
      sendState(room, events);
    } catch (e) {
      if (e instanceof IllegalActionError) return send(ws, { type: "error", message: e.message });
      send(ws, { type: "error", message: "ação inválida" });
    }
  }

  // ---------------------------------------------------------------- WebSocket

  const wss = new WebSocketServer({ server: http, maxPayload: 4096 });

  wss.on("connection", (ws) => {
    let room: Room | null = null;
    // Sem o join em 10 s a conexão é descartada.
    const joinTimer = setTimeout(() => {
      if (!room) ws.close(4001, "join obrigatório");
    }, 10_000);

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return send(ws, { type: "error", message: "mensagem inválida" });
      }
      if (msg.type === "join" && typeof msg.ticket === "string" && !room) {
        room = join(ws, msg);
        if (room) clearTimeout(joinTimer);
        else ws.close(4002, "recusado");
      } else if (msg.type === "action" && room) {
        onAction(room, ws, msg);
      } else {
        send(ws, { type: "error", message: "mensagem inesperada" });
      }
    });

    ws.on("close", () => {
      clearTimeout(joinTimer);
      if (!room) return;
      const i = seatOf(room, ws);
      if (i === null) return;
      room.seats[i]!.ws = null;
      room.lastActivity = Date.now();
      const foe = room.seats[i === 0 ? 1 : 0];
      if (foe?.ws) send(foe.ws, { type: "opponent", status: "disconnected" });
    });
  });

  // Limpeza: ingressos vencidos e salas paradas sem ninguém conectado.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k);
    for (const [code, room] of rooms) {
      const connected = room.seats.some((s) => s?.ws);
      if (!connected && now - room.lastActivity > roomIdle) rooms.delete(code);
    }
  }, 30_000);
  sweeper.unref();

  await new Promise<void>((resolve) => http.listen(options.port, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        for (const client of wss.clients) client.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
