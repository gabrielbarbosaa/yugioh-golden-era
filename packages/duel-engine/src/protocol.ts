import type { DeckReport } from "./deck.ts";
import type { GameView } from "./view.ts";
import type { Action, Card, GameEvent, PlayerIndex } from "./types.ts";

/** Dados públicos de uma carta, enviados ao cliente para desenhar a mesa (nome, números e estrelas). */
export type CardInfo = Pick<Card, "id" | "name" | "atk" | "def" | "level" | "attribute" | "race" | "stars" | "fusion"> & {
  /** Texto do efeito, quando o monstro tem um. */
  effect?: string;
};

/** Magia ou armadilha do duelo, com o texto do efeito. */
export interface SupportInfo {
  id: number;
  name: string;
  kind: "spell" | "trap";
  effect: string;
}

/** Mensagens do cliente para o servidor de duelo (WebSocket, JSON). */
export type ClientMessage =
  /** Primeira mensagem: o ingresso (de uso único) obtido pelo site e, opcionalmente, o código de uma sala existente. */
  | { type: "join"; ticket: string; room?: string; /** Cria uma sala já com o bot como oponente (ignora `room`). */ bot?: boolean }
  | { type: "action"; action: Action };

/** Mensagens do servidor para o cliente. O servidor é a autoridade: o cliente só mostra e pede ações. */
export type ServerMessage =
  | { type: "waiting"; room: string }
  | {
      type: "start";
      room: string;
      you: PlayerIndex;
      opponent: string;
      cards: Record<number, CardInfo>;
      /** Magias e armadilhas que aparecem nos baralhos desta partida. */
      support: Record<number, SupportInfo>;
      /** Presente quando o jogador escolheu um deck da conta: nome e o que entrou no baralho do duelo. */
      deck?: { name: string } & DeckReport;
    }
  | { type: "state"; view: GameView; legal: Action[]; events: GameEvent[] }
  | { type: "opponent"; status: "connected" | "disconnected" }
  | { type: "error"; message: string; fatal?: boolean };