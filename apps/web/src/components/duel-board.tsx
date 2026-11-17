"use client";

import { useRef, useState } from "react";
import type {
  Action,
  CardInfo,
  ClientMessage,
  GameEvent,
  GameView,
  MonsterView,
  ServerMessage,
} from "@golden-era/duel-engine";

const STAR_NAMES: Record<string, string> = {
  sun: "Sol",
  moon: "Lua",
  venus: "Vênus",
  mercury: "Mercúrio",
  mars: "Marte",
  jupiter: "Júpiter",
  saturn: "Saturno",
  uranus: "Urano",
  pluto: "Plutão",
  neptune: "Netuno",
};

const POSITION_NAMES = { attack: "ataque", defense: "defesa", facedown: "virada" } as const;

type Phase = "lobby" | "connecting" | "waiting" | "playing" | "closed";

interface Match {
  room: string;
  you: 0 | 1;
  opponent: string;
  cards: Record<number, CardInfo>;
}

/** Texto de uma linha do histórico, na visão de quem lê. */
function describe(e: GameEvent, you: number, cards: Record<number, CardInfo>, foe: string): string {
  const who = (p: number) => (p === you ? "Você" : foe);
  const name = (id: number) => (id < 0 ? "uma carta" : (cards[id]?.name ?? `#${id}`));
  switch (e.type) {
    case "draw":
      return e.player === you ? `Você comprou ${name(e.cardId)}.` : `${foe} comprou uma carta.`;
    case "play":
      return `${who(e.player)} jogou ${name(e.cardId)} em ${POSITION_NAMES[e.position]}${e.materials.length ? " (fusão)" : ""}.`;
    case "position":
      return `${who(e.player)} mudou um monstro para ${POSITION_NAMES[e.position]}.`;
    case "attack":
      return `${who(e.player)} atacou ${e.target === "direct" ? "direto" : `a zona ${e.target + 1}`}.`;
    case "flip":
      return `${name(e.cardId)} foi revelada.`;
    case "damage":
      return `${who(e.player)} perdeu ${e.amount} LP (restam ${e.lp}).`;
    case "destroyed":
      return `${name(e.cardId)} de ${who(e.player)} foi destruída.`;
    case "turn":
      return `Turno ${e.turn}: vez de ${e.player === you ? "você" : foe}.`;
    case "end":
      return e.winner === "draw" ? `Empate (${e.reason}).` : `${e.winner === you ? "Você venceu" : `${foe} venceu`} (${e.reason}).`;
  }
}

export function DuelBoard({ wsUrl, imageBase }: { wsUrl: string; imageBase: string }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [legal, setLegal] = useState<Action[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [foeOnline, setFoeOnline] = useState(true);
  const [picked, setPicked] = useState<number[]>([]); // índices da mão, na ordem do clique
  const [zone, setZone] = useState<number | null>(null); // monstro próprio selecionado
  // O handler do WebSocket vive mais que a renderização; ele lê o que precisa por aqui.
  const matchRef = useRef<Match | null>(null);

  async function connect(joinRoom?: string) {
    setError(null);
    setPhase("connecting");
    let ticket: string;
    try {
      const res = await fetch("/duel/ticket", { method: "POST" });
      const body = (await res.json()) as { ticket?: string; error?: string };
      if (!res.ok || !body.ticket) throw new Error(body.error ?? "não foi possível entrar");
      ticket = body.ticket;
    } catch (e) {
      setError(e instanceof Error ? e.message : "não foi possível entrar");
      setPhase("lobby");
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      const msg: ClientMessage = { type: "join", ticket, room: joinRoom };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      switch (msg.type) {
        case "waiting":
          setRoom(msg.room);
          setPhase("waiting");
          break;
        case "start": {
          const m = { room: msg.room, you: msg.you, opponent: msg.opponent, cards: msg.cards };
          matchRef.current = m;
          setMatch(m);
          setRoom(msg.room);
          setPhase("playing");
          break;
        }
        case "state": {
          const m = matchRef.current;
          setView(msg.view);
          setLegal(msg.legal);
          setPicked([]);
          setZone(null);
          if (m) {
            const lines = msg.events.map((e) => describe(e, m.you, m.cards, m.opponent));
            if (lines.length) setLog((old) => [...old, ...lines].slice(-60));
          }
          break;
        }
        case "opponent":
          setFoeOnline(msg.status === "connected");
          break;
        case "error":
          setError(msg.message);
          if (msg.fatal) setPhase("lobby");
          break;
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) setPhase((p) => (p === "playing" || p === "waiting" ? "closed" : p));
    };
  }

  function act(action: Action) {
    setError(null);
    wsRef.current?.send(JSON.stringify({ type: "action", action } satisfies ClientMessage));
  }

  function leave() {
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    matchRef.current = null;
    setMatch(null);
    setView(null);
    setLegal([]);
    setLog([]);
    setRoom(null);
    setPicked([]);
    setZone(null);
    setError(null);
    setPhase("lobby");
  }

  if (phase === "lobby" || phase === "connecting") {
    return (
      <section className="duel-lobby">
        {error ? <p role="alert" className="duel-error">{error}</p> : null}
        <button className="button" disabled={phase === "connecting"} onClick={() => connect()}>
          Criar sala
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void connect(code.trim());
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Código da sala"
            maxLength={4}
            aria-label="Código da sala"
          />
          <button className="button ghost" disabled={phase === "connecting" || !code.trim()}>
            Entrar
          </button>
        </form>
      </section>
    );
  }

  if (phase === "waiting") {
    return (
      <section className="duel-lobby">
        <p>
          Sala <strong className="duel-code">{room}</strong> criada. Passe o código para o seu oponente e aguarde…
        </p>
        <button className="button ghost" onClick={leave}>Cancelar</button>
      </section>
    );
  }

  if (phase === "closed" || !match || !view) {
    return (
      <section className="duel-lobby">
        <p className="muted">A conexão com o duelo foi encerrada.</p>
        <button className="button" onClick={leave}>Voltar</button>
      </section>
    );
  }

  const me = view.players[match.you];
  const foe = view.players[match.you === 0 ? 1 : 0];
  const myTurn = view.current === match.you && view.winner === null;
  const card = (id: number | null) => (id === null ? null : match.cards[id]);
  const art = (id: number) => `${imageBase}/cards_small/${id}.jpg`;

  const hand = me.hand ?? [];
  // Jogadas legais que começam com a seleção atual; servem para destacar o que ainda dá para somar à fusão.
  const plays = legal.filter((a): a is Extract<Action, { type: "play" }> => a.type === "play");
  const prefixOf = (a: Extract<Action, { type: "play" }>) => picked.every((p, i) => a.hand[i] === p);
  const nextOk = new Set(plays.filter((a) => prefixOf(a) && a.hand.length > picked.length).map((a) => a.hand[picked.length]!));
  const exact = plays.filter((a) => a.hand.length === picked.length && picked.every((p, i) => a.hand[i] === p));

  const playLabel = (a: Extract<Action, { type: "play" }>) => {
    const first = hand[a.hand[0]!];
    const star = a.hand.length === 1 && first !== undefined ? match.cards[first]?.stars[a.star] : undefined;
    const result = a.result ? ` → ${match.cards[a.result]?.name ?? a.result}` : "";
    return `${POSITION_NAMES[a.position]} · ${star ? STAR_NAMES[star] : `estrela ${a.star + 1}`}${result}`;
  };

  const zoneActions = zone === null ? [] : legal.filter((a) => (a.type === "attack" || a.type === "changePosition") && a.zone === zone);

  const monster = (m: MonsterView | null, i: number, mine: boolean) => {
    const c = m ? card(m.cardId) : null;
    const selected = mine && zone === i;
    return (
      <button
        key={i}
        type="button"
        className={`duel-zone ${m ? `pos-${m.position}` : "empty"} ${selected ? "selected" : ""}`}
        disabled={!m || !mine || !myTurn}
        onClick={() => setZone(selected ? null : i)}
        aria-label={m ? `${mine ? "seu" : "do oponente"} monstro, zona ${i + 1}` : `zona ${i + 1} vazia`}
      >
        {m ? (
          m.cardId === null ? (
            <span className="duel-back" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art(m.cardId)} alt={c?.name ?? ""} width={118} height={172} />
          )
        ) : null}
        {m && c ? (
          <span className="duel-stats">
            {c.atk}/{c.def}
            {m.star ? ` · ${STAR_NAMES[m.star]}` : ""}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <section className="duel">
      <header className="duel-head">
        <span>
          Sala <strong className="duel-code">{match.room}</strong> · contra <strong>{match.opponent}</strong>
          {foeOnline ? "" : " (desconectado)"}
        </span>
        <button className="button ghost" onClick={leave}>Sair</button>
      </header>

      {view.winner !== null ? (
        <p className="duel-result">
          {view.winner === "draw" ? "Empate" : view.winner === match.you ? "Você venceu!" : `${match.opponent} venceu.`} {view.reason}
        </p>
      ) : (
        <p className={myTurn ? "duel-turn mine" : "duel-turn"}>{myTurn ? "Sua vez" : `Vez de ${match.opponent}`} · turno {view.turn}</p>
      )}
      {error ? <p role="alert" className="duel-error">{error}</p> : null}

      <div className="duel-side">
        <span>{match.opponent}: <strong>{foe.lp} LP</strong></span>
        <span className="muted">mão {foe.handCount} · baralho {foe.deckCount}</span>
      </div>
      <div className="duel-row">{foe.field.map((m, i) => monster(m, i, false))}</div>
      <div className="duel-row">{me.field.map((m, i) => monster(m, i, true))}</div>
      <div className="duel-side">
        <span>Você: <strong>{me.lp} LP</strong></span>
        <span className="muted">baralho {me.deckCount}</span>
      </div>

      {zoneActions.length ? (
        <div className="duel-actions">
          {zoneActions.map((a, i) => (
            <button key={i} className="button" onClick={() => act(a)}>
              {a.type === "attack"
                ? a.target === "direct"
                  ? "Atacar direto"
                  : `Atacar a zona ${a.target + 1}`
                : `Mudar para ${POSITION_NAMES[(a as Extract<Action, { type: "changePosition" }>).position]}`}
            </button>
          ))}
        </div>
      ) : null}

      <div className="duel-hand">
        {hand.map((id, i) => {
          const on = picked.includes(i);
          const usable = myTurn && (on || (picked.length === 0 ? plays.some((a) => a.hand[0] === i) : nextOk.has(i)));
          return (
            <button
              key={i}
              type="button"
              className={`duel-card ${on ? "selected" : ""}`}
              disabled={!usable}
              title={`${match.cards[id]?.name ?? id}${match.cards[id] ? ` · ${match.cards[id].atk}/${match.cards[id].def}` : ""}`}
              onClick={() => setPicked(on ? picked.filter((p) => p !== i) : [...picked, i])}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art(id)} alt={match.cards[id]?.name ?? ""} width={118} height={172} />
              <span className="duel-stats">{match.cards[id]?.atk}/{match.cards[id]?.def}</span>
            </button>
          );
        })}
      </div>

      {myTurn ? (
        <div className="duel-actions">
          {exact.map((a, i) => (
            <button key={i} className="button" onClick={() => act(a)}>
              {a.hand.length > 1 ? "Fundir" : "Jogar"} · {playLabel(a)}
            </button>
          ))}
          {picked.length > 0 ? (
            <button className="button ghost" onClick={() => setPicked([])}>Limpar seleção</button>
          ) : null}
          <button className="button ghost" onClick={() => act({ type: "endTurn" })}>Encerrar turno</button>
        </div>
      ) : null}
      {myTurn && picked.length === 1 && nextOk.size > 0 ? <p className="muted">Escolha outra carta da mão para tentar uma fusão.</p> : null}

      <ol className="duel-log" aria-label="Histórico">
        {log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}
      </ol>
    </section>
  );
}
