import type { Card } from "@golden-era/api-client";
import Image from "next/image";
import Link from "next/link";

import { LimitBadge } from "@/components/limit-badge";

/** Grade de cartas; cada uma leva ao detalhe. As imagens vêm da própria API, então não passam pelo otimizador. */
export function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <ul className="card-grid">
      {cards.map((card) => (
        <li key={card.id}>
          <Link href={`/cards/${card.id}`}>
            <span className="thumb">
              <Image src={card.imageSmallUrl} alt={card.name} width={118} height={172} unoptimized />
              <LimitBadge maxCopies={card.maxCopies} />
            </span>
            {card.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
