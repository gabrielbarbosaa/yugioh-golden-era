import type { Card } from "@golden-era/api-client";
import Image from "next/image";
import Link from "next/link";

/** Grade de cartas; cada uma leva ao detalhe. As imagens vêm da própria API, então não passam pelo otimizador. */
export function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <ul className="card-grid">
      {cards.map((card) => (
        <li key={card.id}>
          <Link href={`/cards/${card.id}`}>
            <Image src={card.imageSmallUrl} alt={card.name} width={118} height={172} unoptimized />
            {card.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
