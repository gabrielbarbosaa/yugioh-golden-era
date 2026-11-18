"use client";

import { useRef, useState } from "react";
import type { Action, ClientMessage, GameView, MonsterView, PlayerView, ServerMessage } from "@golden-era/duel-engine";

import { DuelLobby, WaitingRoom, type DuelDeck } from "./duel-lobby";
import { describeEvent, fxFor, hasFusion, POSITION_NAMES, revealsFor, type Fx } from "@golden-era/duel-engine/present";

import { factsOf, PendingPanel, REVEAL_MS, RevealOverlay, STAR_NAMES, SummonPanel, type Match, type Reveal } from "./duel-parts";

type Phase = "lobby" | "connecting" | "waiting" | "playing" | "closed";

export function DuelBoard({ wsUrl, imageBase, decks }: { wsUrl: string; imageBase: string; decks: DuelDeck[] }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [error, setError] = useState<string | null>(null);
  const [deckId, setDeckId] = useState(""); // vazio = baralho aleatório
  const [room, setRoom] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [legal, setLegal] = useState<Action[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [foeOnline, setFoeOnline] = useState(true);
  const [picked, setPicked] = useState<number[]>([]); // índices da mão, na ordem do clique
  const [zone, setZone] = useState<number | null>(null); // monstro próprio selecionado
  const [sacZone, setSacZone] = useState<number | null>(null); // monstro próprio a sacrificar (campo cheio)
  const [inspect, setInspect] = useState<number | null>(null); // carta mostrada em detalhe ao passar o mouse
  const [graveOf, setGraveOf] = useState<0 | 1 | null>(null); // cemitério aberto (índice absoluto do jogador)
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [fx, setFx] = useState<Record<string, Fx>>({});
  // O handler do WebSocket vive mais que a renderização; ele lê o que precisa por aqui.
  const matchRef = useRef<Match | null>(null);
  const counter = useRef(0);
  const queue = useRef<Reveal[]>([]);
  const showing = useRef(false);

  const nextId = () => ++counter.current;

  /** Mostra os anúncios um depois do outro (cada um fica uns segundos na tela). */
  function pump() {
    if (showing.current) return;
    const item = queue.current.shift();
    if (!item) return;
    showing.current = true;
    setReveal(item);
    setTimeout(
      () => {
        setReveal(null);
        showing.current = false;
        pump();
      },
      REVEAL_MS[item.kind],
    );
  }

  function addFx(entries: Record<string, Fx>) {
    const keys = Object.keys(entries);
    if (keys.length === 0) return;
    setFx((old) => ({ ...old, ...entries }));
    setTimeout(() => {
      setFx((old) => {
        const next = { ...old };
        for (const k of keys) if (next[k]?.id === entries[k]!.id) delete next[k];
        return next;
      });
    }, 1300);
  }

  async function connect(joinRoom?: string, bot = false) {
    setError(null);
    setPhase("connecting");
    let ticket: string;
    try {
      const res = await fetch("/duel/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: deckId || undefined }),
      });
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
      const msg: ClientMessage = { type: "join", ticket, room: joinRoom, bot };
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
          const m = { room: msg.room, you: msg.you, opponent: msg.opponent, cards: msg.cards, support: msg.support, deck: msg.deck };
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
          setSacZone(null);
          if (m) {
            const lines = msg.events.map((e) => describeEvent(e, m.you, m.cards, m.support, m.opponent));
            if (lines.length) setLog((old) => [...old, ...lines].slice(-80));
            queue.current.push(...revealsFor(msg.events, m, nextId));
            pump();
            // Numa fusão o monstro novo só "chega" depois da animação (ela cobre a mesa).
            const fused = hasFusion(msg.events);
            const fxs = fxFor(msg.events, nextId);
            if (fused) setTimeout(() => addFx(fxs), REVEAL_MS.fusion - 300);
            else addFx(fxs);
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
    queue.current = [];
    showing.current = false;
    setMatch(null);
    setView(null);
    setLegal([]);
    setLog([]);
    setRoom(null);
    setPicked([]);
    setZone(null);
    setSacZone(null);
    setInspect(null);
    setGraveOf(null);
    setReveal(null);
    setFx({});
    setError(null);
    setPhase("lobby");
  }

  if (phase === "lobby" || phase === "connecting") {
    return (
      <DuelLobby
        decks={decks}
        deckId={deckId}
        onPick={setDeckId}
        busy={phase === "connecting"}
        error={error}
        onBot={() => connect(undefined, true)}
        onCreate={() => connect()}
        onJoin={(c) => void connect(c)}
      />
    );
  }

  if (phase === "waiting") {
    return <WaitingRoom room={room ?? ""} deckName={decks.find((d) => d.id === deckId)?.name ?? "Aleatório"} onCancel={leave} />;
  }
  if (phase === "closed" || !match || !view) {
    return (
      <section className="duel-lobby">
        <p className="muted">A conexão com o duelo foi encerrada.</p>
        <button className="button" onClick={leave}>Voltar</button>
      </section>
    );
  }

  const foeIdx: 0 | 1 = match.you === 0 ? 1 : 0;
  const me = view.players[match.you];
  const foe = view.players[foeIdx];
  const pend = view.pending;
  const canAct = view.actor === match.you && view.winner === null;
  const myTurn = canAct && pend === null; // jogadas normais; com algo pendente só responder/escolher
  const nameOf = (id: number | null) => (id === null ? "carta virada" : factsOf(match, id).name);
  const art = (id: number) => `${imageBase}/cards_small/${id}.jpg`;
  const bigArt = (id: number) => `${imageBase}/cards/${id}.jpg`;
  const inspectProps = (id: number | null) =>
    id === null
      ? {}
      : { onMouseEnter: () => setInspect(id), onFocus: () => setInspect(id) };

  const hand = me.hand ?? [];
  // Jogadas legais que começam com a seleção atual; servem para destacar o que ainda dá para somar à fusão.
  const plays = legal.filter((a): a is Extract<Action, { type: "play" }> => a.type === "play");
  const prefixOf = (a: Extract<Action, { type: "play" }>) => picked.every((p, i) => a.hand[i] === p);
  const nextOk = new Set(plays.filter((a) => prefixOf(a) && a.hand.length > picked.length).map((a) => a.hand[picked.length]!));
  /** Ação de magia/armadilha da mão para a carta do índice `i` (a lista legal traz uma por carta distinta). */
  const supportActionFor = (i: number) =>
    legal.find((a): a is Extract<Action, { type: "spell" | "setTrap" }> => (a.type === "spell" || a.type === "setTrap") && hand[a.hand] === hand[i]);
  const supportPicked = picked.length === 1 && match.support[hand[picked[0]!]!] ? supportActionFor(picked[0]!) : undefined;
  const exactAll = plays.filter((a) => a.hand.length === picked.length && picked.every((p, i) => a.hand[i] === p));
  // Com o campo cheio cada jogada exige sacrificar um monstro seu: o jogador escolhe clicando nele no campo.
  const needsSacrifice = exactAll.some((a) => a.sacrifice !== undefined);
  const exact = needsSacrifice ? (sacZone === null ? [] : exactAll.filter((a) => a.sacrifice === sacZone)) : exactAll;

  const zoneActions = zone === null ? [] : legal.filter((a) => (a.type === "attack" || a.type === "changePosition") && a.zone === zone);

  // ---- peças da mesa

  const monster = (m: MonsterView | null, i: number, abs: 0 | 1) => {
    const mine = abs === match.you;
    const effect = fx[`${abs}:${i}`];
    const c = m && m.cardId !== null ? match.cards[m.cardId] : null;
    const selected = mine && (needsSacrifice ? sacZone === i : zone === i);
    const cls = ["duel-zone", m ? `pos-${m.position}` : "empty", selected ? "selected" : "", effect && effect.kind !== "ghost" && effect.kind !== "damage" && effect.kind !== "heal" ? `fx-${effect.kind}` : ""];
    return (
      <button
        key={effect ? `${i}-${effect.id}` : i}
        type="button"
        className={cls.join(" ")}
        disabled={!m || !mine || !myTurn}
        onClick={() => (needsSacrifice ? setSacZone(selected ? null : i) : setZone(selected ? null : i))}
        aria-label={m ? `${mine ? "seu" : "do oponente"} monstro, zona ${i + 1}` : `zona ${i + 1} vazia`}
        {...inspectProps(m?.cardId ?? null)}
      >
        {m ? (
          // Virado para baixo mostra o verso (de lado) também para o dono; o inspetor ainda diz qual carta é.
          m.cardId === null || m.position === "facedown" || m.position === "setattack" ? (
            <span className="duel-back" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art(m.cardId)} alt={nameOf(m.cardId)} width={118} height={172} />
          )
        ) : effect?.kind === "ghost" && effect.cardId !== undefined ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="duel-ghost" src={art(effect.cardId)} alt="" width={118} height={172} />
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

  const trapRow = (p: PlayerView, abs: 0 | 1) => (
    <div className="duel-traps" aria-label={abs === match.you ? "Suas armadilhas" : "Armadilhas do oponente"}>
      {p.traps.map((t, i) => (
        <span
          key={i}
          className={`duel-trap ${t ? "set" : "empty"}`}
          title={t?.cardId != null ? nameOf(t.cardId) : t ? "Armadilha virada" : undefined}
          {...inspectProps(t?.cardId ?? null)}
        >
          {t?.cardId != null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art(t.cardId)} alt={nameOf(t.cardId)} width={56} height={82} />
          ) : t ? (
            <span className="duel-back" />
          ) : null}
        </span>
      ))}
    </div>
  );

  const playerBar = (p: PlayerView, abs: 0 | 1) => {
    const mine = abs === match.you;
    const lpFx = fx[`lp:${abs}`];
    const pct = Math.max(0, Math.min(100, (p.lp / 8000) * 100));
    return (
      <div className={`duel-bar ${mine ? "me" : "foe"}`}>
        <div className="duel-bar-name">
          <strong>{mine ? "Você" : match.opponent}</strong>
          {!mine && !foeOnline ? <span className="muted"> (desconectado)</span> : null}
        </div>
        <div className="duel-lp" role="meter" aria-valuemin={0} aria-valuemax={8000} aria-valuenow={p.lp} aria-label={`Vida de ${mine ? "você" : match.opponent}`}>
          <span className={`duel-lp-fill ${pct < 25 ? "low" : ""}`} style={{ width: `${pct}%` }} />
          <span className="duel-lp-text">{p.lp} LP</span>
          {lpFx ? (
            <span key={lpFx.id} className={`duel-float ${lpFx.kind}`}>
              {lpFx.text}
            </span>
          ) : null}
        </div>
        <div className="duel-piles">
          <span title="Cartas na mão">✋ {p.handCount}</span>
          <span title="Cartas no baralho">🂠 {p.deckCount}</span>
          <button type="button" className="duel-pile-button duel-grave-button" onClick={() => setGraveOf(abs)} title="Ver o cemitério" aria-label={`Ver o cemitério ${mine ? "seu" : `de ${match.opponent}`} (${p.graveyard.length} cartas)`}>
            {p.graveyard.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art(p.graveyard[p.graveyard.length - 1]!)} alt="" width={24} height={35} />
            ) : (
              <span className="duel-grave-empty" aria-hidden="true">☠</span>
            )}
            <span>Cemitério · {p.graveyard.length}</span>
          </button>
        </div>
      </div>
    );
  };

  const inspected = inspect !== null ? factsOf(match, inspect) : null;
  const statusText = pend ? (canAct ? "Sua resposta" : `Aguardando ${match.opponent}…`) : myTurn ? "Sua vez" : `Vez de ${match.opponent}`;

  return (
    <section className="duel">
      <header className="duel-head">
        <span>
          Sala <strong className="duel-code">{match.room}</strong> · contra <strong>{match.opponent}</strong>
        </span>
        {match.deck ? (
          <span className="muted duel-deckinfo">
            Baralho: <strong>{match.deck.name}</strong> · {match.deck.used} cartas do deck
            {match.deck.ignored ? `, ${match.deck.ignored} ignoradas` : ""}
            {match.deck.filled ? `, ${match.deck.filled} sorteadas` : ""}
          </span>
        ) : null}
        <button className="button ghost" onClick={leave}>Sair</button>
      </header>
      {error ? <p role="alert" className="duel-error">{error}</p> : null}

      <div className="duel-layout">
        <div className="duel-stage">
          <div className="duel-mat foe-side">
            <div className="duel-foe-hand" aria-hidden="true">
              {Array.from({ length: Math.min(foe.handCount, 8) }, (_, i) => (
                <span key={i} className="duel-back mini" />
              ))}
            </div>
            {playerBar(foe, foeIdx)}
            {trapRow(foe, foeIdx)}
            <div className="duel-row">{foe.field.map((m, i) => monster(m, i, foeIdx))}</div>
          </div>

          <div className={`duel-divider ${canAct ? "mine" : ""} ${view.winner !== null ? "over" : ""}`}>
            {view.winner !== null ? (
              <strong>
                {view.winner === "draw" ? "Empate" : view.winner === match.you ? "Você venceu!" : `${match.opponent} venceu.`} {view.reason}
              </strong>
            ) : (
              <>
                <strong>{statusText}</strong>
                <span className="muted">
                  turno {view.turn}
                  {myTurn && view.spellUsed ? " · magia do turno já usada" : ""}
                </span>
              </>
            )}
          </div>

          <div className="duel-mat me-side">
            <div className="duel-row">{me.field.map((m, i) => monster(m, i, match.you))}</div>
            {trapRow(me, match.you)}
            {playerBar(me, match.you)}
          </div>

          <PendingPanel view={view} match={match} legal={legal} imageBase={imageBase} onAct={act} onInspect={setInspect} />

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
              const sup = match.support[id];
              const usable = myTurn && (on || (picked.length === 0 ? plays.some((a) => a.hand[0] === i) || supportActionFor(i) !== undefined : nextOk.has(i)));
              return (
                <button
                  key={i}
                  type="button"
                  className={`duel-card ${on ? "selected" : ""} ${sup ? sup.kind : ""}`}
                  disabled={!usable}
                  onClick={() => {
                    setSacZone(null);
                    setPicked(on ? picked.filter((p) => p !== i) : [...picked, i]);
                  }}
                  {...inspectProps(id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={art(id)} alt={nameOf(id)} width={118} height={172} />
                  <span className="duel-stats">{sup ? (sup.kind === "spell" ? "Magia" : "Armadilha") : `${match.cards[id]?.atk}/${match.cards[id]?.def}`}</span>
                </button>
              );
            })}
          </div>

          {myTurn ? (
            <div className="duel-actions">
              {supportPicked ? (
                <button className="button" onClick={() => act(supportPicked)}>
                  {supportPicked.type === "spell" ? "Usar magia" : "Pôr a armadilha virada"} · {nameOf(hand[picked[0]!]!)}
                </button>
              ) : null}
              {picked.length > 0 ? (
                <button className="button ghost" onClick={() => { setPicked([]); setSacZone(null); }}>Limpar seleção</button>
              ) : null}
              <button className="button ghost" onClick={() => act({ type: "endTurn" })}>Encerrar turno</button>
            </div>
          ) : null}
          {myTurn && exact.length > 0 ? (
            <SummonPanel
              key={`${picked.join(",")}-${sacZone}`}
              plays={exact}
              hand={hand}
              match={match}
              imageBase={imageBase}
              sacrificeName={sacZone !== null ? nameOf(me.field[sacZone]?.cardId ?? null) : null}
              onAct={act}
              onCancel={() => {
                setPicked([]);
                setSacZone(null);
              }}
            />
          ) : null}
          {myTurn && needsSacrifice && sacZone === null ? (
            <p className="muted duel-hint">Campo cheio: clique em um dos seus monstros para sacrificá-lo e dar lugar à carta.</p>
          ) : null}
          {myTurn && picked.length === 1 && nextOk.size > 0 ? <p className="muted duel-hint">Escolha outra carta da mão para tentar uma fusão.</p> : null}
        </div>

        <aside className="duel-aside">
          <div className="duel-inspector" aria-live="polite">
            {inspected ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bigArt(inspected.id)} alt={inspected.name} width={240} />
                <h3>{inspected.name}</h3>
                <p className="muted">{inspected.kind}{inspected.stats ? ` · ${inspected.stats}` : ""}</p>
                {inspected.text ? <p>{inspected.text}</p> : null}
              </>
            ) : (
              <p className="muted">Passe o mouse sobre uma carta para ver os detalhes.</p>
            )}
          </div>
          <ol className="duel-log" aria-label="Histórico">
            {log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        </aside>
      </div>

      {reveal ? <RevealOverlay reveal={reveal} imageBase={imageBase} /> : null}

      {graveOf !== null ? (
        <div className="duel-modal" role="dialog" aria-label="Cemitério" onClick={() => setGraveOf(null)}>
          <div className="duel-modal-box" onClick={(e) => e.stopPropagation()}>
            <header>
              <div className="duel-grave-tabs" role="tablist" aria-label="Cemitérios">
                {([match.you, foeIdx] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    role="tab"
                    aria-selected={graveOf === side}
                    className={`duel-grave-tab ${graveOf === side ? "on" : ""}`}
                    onClick={() => setGraveOf(side)}
                  >
                    {side === match.you ? "Seu cemitério" : `Cemitério de ${match.opponent}`} ({view.players[side].graveyard.length})
                  </button>
                ))}
              </div>
              <button className="button ghost small" onClick={() => setGraveOf(null)}>Fechar</button>
            </header>
            {view.players[graveOf].graveyard.length === 0 ? (
              <p className="muted">Vazio.</p>
            ) : (
              <>
                <p className="muted duel-grave-note">Da mais recente para a mais antiga. Passe o mouse sobre uma carta para ver os detalhes.</p>
                {inspected && view.players[graveOf].graveyard.includes(inspected.id) ? (
                  <div className="duel-grave-detail" aria-live="polite">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bigArt(inspected.id)} alt={inspected.name} width={120} />
                    <div>
                      <strong>{inspected.name}</strong>
                      <p className="muted">{inspected.kind}{inspected.stats ? ` · ${inspected.stats}` : ""}</p>
                      {inspected.text ? <p>{inspected.text}</p> : null}
                    </div>
                  </div>
                ) : null}
                <ul className="duel-grave">
                  {view.players[graveOf].graveyard
                    .map((id, i) => ({ id, i }))
                    .reverse()
                    .map(({ id, i }, n) => (
                      <li key={i} tabIndex={0} {...inspectProps(id)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={art(id)} alt={nameOf(id)} width={90} height={131} />
                        <span>{nameOf(id)}</span>
                        {n === 0 ? <em className="duel-grave-new">mais recente</em> : null}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
