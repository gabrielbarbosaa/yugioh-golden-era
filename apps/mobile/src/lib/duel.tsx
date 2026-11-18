import type { Action, ClientMessage, GameView, ServerMessage } from '@golden-era/duel-engine';
import { describeEvent, fxFor, hasFusion, REVEAL_MS, revealsFor, type Fx, type Match, type Reveal } from '@golden-era/duel-engine/present';
import { createContext, use, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { api, API_URL } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { tokenStore } from '@/lib/token-store';

/**
 * Endereço do servidor de duelo. No emulador Android a máquina hospedeira é 10.0.2.2; em celular físico defina
 * EXPO_PUBLIC_DUEL_URL com o IP da máquina (ex.: http://192.168.1.4:8787), como a API.
 */
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';
export const DUEL_HTTP_URL = (process.env.EXPO_PUBLIC_DUEL_URL ?? fallback).replace(/\/$/, '');
const DUEL_WS_URL = DUEL_HTTP_URL.replace(/^http/, 'ws');

/** Prefixo das imagens das cartas (a API as serve em /images; em celular físico use o IP da máquina). */
export const IMAGE_BASE = (process.env.EXPO_PUBLIC_IMAGE_BASE_URL ?? API_URL.replace(/\/v1$/, '') + '/images').replace(/\/$/, '');
export const cardArt = (id: number) => `${IMAGE_BASE}/cards_small/${id}.jpg`;
export const cardBig = (id: number) => `${IMAGE_BASE}/cards/${id}.jpg`;

export type Phase = 'idle' | 'connecting' | 'waiting' | 'playing' | 'closed';

export type DuelSession = {
  phase: Phase;
  error: string | null;
  room: string | null;
  deckName: string;
  match: Match | null;
  view: GameView | null;
  legal: Action[];
  log: string[];
  foeOnline: boolean;
  /** Sobe a cada estado novo do servidor; a mesa usa para limpar a seleção do jogador. */
  version: number;
  /** Anúncio em exibição (magia, armadilha, fusão...). */
  reveal: Reveal | null;
  /** Efeitos curtos por zona (`jogador:zona`) ou vida (`lp:jogador`). */
  fx: Record<string, Fx>;
  connect(options: { deckId?: string; deckName?: string; room?: string; bot?: boolean }): Promise<void>;
  act(action: Action): void;
  leave(): void;
};

const DuelContext = createContext<DuelSession | null>(null);

export function DuelProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const matchRef = useRef<Match | null>(null);
  const counter = useRef(0);
  const queue = useRef<Reveal[]>([]);
  const showing = useRef(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [deckName, setDeckName] = useState('Aleatório');
  const [match, setMatch] = useState<Match | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [legal, setLegal] = useState<Action[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [foeOnline, setFoeOnline] = useState(true);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [fx, setFx] = useState<Record<string, Fx>>({});
  const [version, setVersion] = useState(0);

  const nextId = () => ++counter.current;

  /** Mostra os anúncios um depois do outro (cada um fica uns segundos na tela). */
  function pump() {
    if (showing.current) return;
    const item = queue.current.shift();
    if (!item) return;
    showing.current = true;
    setReveal(item);
    setTimeout(() => {
      setReveal(null);
      showing.current = false;
      pump();
    }, REVEAL_MS[item.kind]);
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

  /** Troca a sessão por um ingresso curto de uso único. O servidor de duelo confere o token com a API. */
  async function getTicket(deckId?: string): Promise<string> {
    await api.GET('/me'); // o cliente renova o token de acesso se ele já expirou
    const token = await tokenStore.getAccessToken();
    if (!token) throw new Error('Faça login para jogar.');
    let res: Response;
    try {
      res = await fetch(`${DUEL_HTTP_URL}/tickets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(deckId ? { deckId } : {}),
      });
    } catch {
      throw new Error('Servidor de duelo indisponível.');
    }
    if (res.status === 404) throw new Error('Deck não encontrado.');
    if (!res.ok) throw new Error('Sessão recusada pelo servidor de duelo.');
    const body = (await res.json()) as { ticket?: string };
    if (!body.ticket) throw new Error('Não foi possível entrar.');
    return body.ticket;
  }

  async function connect({ deckId, deckName: name, room: joinRoom, bot = false }: { deckId?: string; deckName?: string; room?: string; bot?: boolean }) {
    setError(null);
    setPhase('connecting');
    setDeckName(name ?? 'Aleatório');
    let ticket: string;
    try {
      ticket = await getTicket(deckId);
    } catch (e) {
      setError(e instanceof Error ? e.message : describeError(e));
      setPhase('idle');
      return;
    }

    const ws = new WebSocket(DUEL_WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      const msg: ClientMessage = { type: 'join', ticket, room: joinRoom, bot };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      switch (msg.type) {
        case 'waiting':
          setRoom(msg.room);
          setPhase('waiting');
          break;
        case 'start': {
          const m: Match = { room: msg.room, you: msg.you, opponent: msg.opponent, cards: msg.cards, support: msg.support, deck: msg.deck };
          matchRef.current = m;
          setMatch(m);
          setRoom(msg.room);
          setPhase('playing');
          break;
        }
        case 'state': {
          const m = matchRef.current;
          setView(msg.view);
          setLegal(msg.legal);
          setVersion((v) => v + 1);
          if (m) {
            const lines = msg.events.map((e) => describeEvent(e, m.you, m.cards, m.support, m.opponent));
            if (lines.length) setLog((old) => [...old, ...lines].slice(-80));
            queue.current.push(...revealsFor(msg.events, m, nextId));
            pump();
            // Numa fusão o monstro novo só "chega" depois da animação (ela cobre a mesa).
            const fxs = fxFor(msg.events, nextId);
            if (hasFusion(msg.events)) setTimeout(() => addFx(fxs), REVEAL_MS.fusion - 300);
            else addFx(fxs);
          }
          break;
        }
        case 'opponent':
          setFoeOnline(msg.status === 'connected');
          break;
        case 'error':
          setError(msg.message);
          if (msg.fatal) setPhase('idle');
          break;
      }
    };
    ws.onerror = () => {
      if (wsRef.current === ws) setError('Falha na conexão com o servidor de duelo.');
    };
    ws.onclose = () => {
      if (wsRef.current === ws) setPhase((p) => (p === 'playing' || p === 'waiting' ? 'closed' : p === 'connecting' ? 'idle' : p));
    };
  }

  function act(action: Action) {
    setError(null);
    wsRef.current?.send(JSON.stringify({ type: 'action', action } satisfies ClientMessage));
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
    setReveal(null);
    setFx({});
    setError(null);
    setFoeOnline(true);
    setPhase('idle');
  }

  const session: DuelSession = { phase, error, room, deckName, match, view, legal, log, foeOnline, version, reveal, fx, connect, act, leave };
  return <DuelContext value={session}>{children}</DuelContext>;
}

export function useDuel(): DuelSession {
  const session = use(DuelContext);
  if (!session) throw new Error('useDuel precisa estar dentro de <DuelProvider>');
  return session;
}