import type { GameView } from "./view.ts";
import type { Action, Card, GameEvent, PlayerIndex } from "./types.ts";

/** Dados públicos de uma carta, enviados ao cliente para desenhar a mesa (nome, números e estrelas). */
export type CardInfo = Pick<Card, "id" | "name" | "atk" | "def" | "level" | "attribute" | "race" | "stars" | "fusion">;

/** Mensagens do cliente para o servidor de duelo (WebSocket, JSON). */
export type ClientMessage =
  /** Primeira mensagem: o ingresso (de uso único) obtido pelo site e, opcionalmente, o código de uma sala existente. */
  | { type: "join"; ticket: string; room?: string }
  | { type: "action"; action: Action };

/** Mensagens do servidor para o cliente. O servidor é a autoridade: o cliente só mostra e pede ações. */
export type ServerMessage =
  | { type: "waiting"; room: string }
  | { type: "start"; room: string; you: PlayerIndex; opponent: string; cards: Record<number, CardInfo> }
  | { type: "state"; view: GameView; legal: Action[]; events: GameEvent[] }
  | { type: "opponent"; status: "connected" | "disconnected" }
  | { type: "error"; message: string; fatal?: boolean };