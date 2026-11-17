import type { DeckSummary } from "@golden-era/api-client";
import Image from "next/image";
import Link from "next/link";

/** Lista de decks. Com `showVisibility` (decks do próprio jogador) marca rascunhos privados. */
export function DeckList({ decks, showVisibility = false }: { decks: DeckSummary[]; showVisibility?: boolean }) {
  return (
    <ul className="deck-list">
      {decks.map((deck) => (
        <li key={deck.id}>
          <Link href={`/decks/${deck.id}`} className="deck-row">
            {deck.coverImageUrl ? (
              <Image src={deck.coverImageUrl} alt="" width={56} height={82} unoptimized />
            ) : (
              <span className="no-cover" aria-hidden />
            )}
            <span>
              <strong>{deck.name}</strong>
              {showVisibility ? (
                <span className={`visibility-tag ${deck.visibility === "private" ? "draft" : ""}`}>
                  {deck.visibility === "private" ? "Privado" : "Público"}
                </span>
              ) : null}
              <br />
              <span className="muted">
                por @{deck.owner.username}
                {deck.archetype ? ` · ${deck.archetype}` : ""}
              </span>
              <br />
              <span className="muted">
                ♥ {deck.likeCount} · 💬 {deck.commentCount}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
