"use client";

import Link from "next/link";
import { useState } from "react";

/** Deck da conta que pode ser levado para o duelo. */
export interface DuelDeck {
  id: string;
  name: string;
  cover: string | null;
  archetype: string | null;
  visibility: "public" | "private";
}

/** Escolha do baralho: "Aleatório" ou um dos decks da conta, como cartas clicáveis. */
function DeckPicker({ decks, deckId, onPick, disabled }: { decks: DuelDeck[]; deckId: string; onPick: (id: string) => void; disabled: boolean }) {
  return (
    <div className="lobby-decks" role="radiogroup" aria-label="Baralho do duelo">
      <button type="button" role="radio" aria-checked={deckId === ""} disabled={disabled} className={`lobby-deck ${deckId === "" ? "on" : ""}`} onClick={() => onPick("")}>
        <span className="lobby-deck-art random" aria-hidden="true" />
        <span className="lobby-deck-text">
          <strong>Aleatório</strong>
          <span className="muted">40 cartas sorteadas da era</span>
        </span>
        <span className="lobby-deck-check" aria-hidden="true">✓</span>
      </button>
      {decks.map((d) => (
        <button key={d.id} type="button" role="radio" aria-checked={deckId === d.id} disabled={disabled} className={`lobby-deck ${deckId === d.id ? "on" : ""}`} onClick={() => onPick(d.id)}>
          {d.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lobby-deck-art" src={d.cover} alt="" width={56} height={82} />
          ) : (
            <span className="lobby-deck-art empty" aria-hidden="true" />
          )}
          <span className="lobby-deck-text">
            <strong>{d.name}</strong>
            <span className="muted">
              {d.visibility === "private" ? "Privado" : "Público"}
              {d.archetype ? ` · ${d.archetype}` : ""}
            </span>
          </span>
          <span className="lobby-deck-check" aria-hidden="true">✓</span>
        </button>
      ))}
    </div>
  );
}

/** Tela inicial do duelo: escolher o baralho e como jogar (contra o bot, criando uma sala ou entrando com um código). */
export function DuelLobby({
  decks,
  deckId,
  onPick,
  busy,
  error,
  onBot,
  onCreate,
  onJoin,
}: {
  decks: DuelDeck[];
  deckId: string;
  onPick: (id: string) => void;
  busy: boolean;
  error: string | null;
  onBot: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const chosen = decks.find((d) => d.id === deckId);

  return (
    <section className="lobby">
      {error ? <p role="alert" className="lobby-error">{error}</p> : null}

      <div className="lobby-grid">
        <div className="lobby-panel">
          <h2><span className="lobby-step">1</span> Escolha o seu baralho</h2>
          <DeckPicker decks={decks} deckId={deckId} onPick={onPick} disabled={busy} />
          {decks.length === 0 ? (
            <p className="muted lobby-note">
              Você ainda não tem decks. <Link href="/decks/new">Monte um</Link> ou jogue com um baralho aleatório.
            </p>
          ) : null}
          <details className="lobby-rules">
            <summary>Como o baralho é usado no duelo</summary>
            <p className="muted">
              O duelo usa os monstros e as magias/armadilhas que o modo conhece. Fusões, Extra Deck, Side Deck e o resto do deck
              ficam de fora, e o que faltar para 40 cartas é completado ao acaso.
            </p>
          </details>
        </div>

        <div className="lobby-panel">
          <h2><span className="lobby-step">2</span> Como você quer jogar?</h2>

          <button className="lobby-mode primary" disabled={busy} onClick={onBot}>
            <span className="lobby-mode-icon" aria-hidden="true">⚔</span>
            <span className="lobby-mode-text">
              <strong>Jogar contra o bot</strong>
              <span>Partida na hora, sem esperar ninguém.</span>
            </span>
          </button>

          <button className="lobby-mode" disabled={busy} onClick={onCreate}>
            <span className="lobby-mode-icon" aria-hidden="true">✦</span>
            <span className="lobby-mode-text">
              <strong>Criar sala</strong>
              <span>Gera um código para um amigo entrar.</span>
            </span>
          </button>

          <form
            className="lobby-join"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length > 0) onJoin(code.trim());
            }}
          >
            <label htmlFor="lobby-code">Já tem um código?</label>
            <div className="lobby-join-row">
              <input
                id="lobby-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABCD"
                maxLength={4}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              <button className="button" disabled={busy || code.trim().length === 0}>Entrar na sala</button>
            </div>
          </form>

          <p className="lobby-picked muted">
            {busy ? "Conectando ao duelo…" : <>Baralho escolhido: <strong>{chosen ? chosen.name : "Aleatório"}</strong></>}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Sala criada, aguardando o oponente: código grande, botão de copiar e o baralho escolhido. */
export function WaitingRoom({ room, deckName, onCancel }: { room: string; deckName: string; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(room);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sem permissão da área de transferência: o código continua visível na tela.
    }
  }

  return (
    <section className="lobby waiting">
      <div className="lobby-panel waiting-box">
        <p className="muted">Sala criada</p>
        <div className="waiting-code" aria-label={`Código da sala: ${room.split("").join(" ")}`}>
          {room.split("").map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
        <p>Passe esse código para o seu oponente.</p>
        <p className="waiting-status" role="status">
          <span className="waiting-dot" aria-hidden="true" /> Aguardando o oponente entrar…
        </p>
        <p className="muted">Baralho: <strong>{deckName}</strong></p>
        <div className="waiting-actions">
          <button className="button" onClick={copy}>{copied ? "Copiado!" : "Copiar código"}</button>
          <button className="button ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </section>
  );
}
