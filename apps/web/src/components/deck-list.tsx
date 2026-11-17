import type { DeckSummary } from "@golden-era/api-client";
import Image from "next/image";
import Link from "next/link";

export function DeckList({ decks }: { decks: DeckSummary[] }) {
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
