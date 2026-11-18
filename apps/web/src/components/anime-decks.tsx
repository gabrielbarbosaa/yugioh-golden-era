import Image from "next/image";

import { importAnimeDeck } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { api } from "@/lib/api";

/** Decks de personagens do anime que o dono do perfil pode copiar para a conta (viram rascunhos privados). */
export async function AnimeDecks() {
  const { data } = await api.GET("/anime-decks");
  if (!data?.length) return null;

  return (
    <section aria-labelledby="anime-decks-title">
      <h2 id="anime-decks-title">Decks de personagens do anime</h2>
      <p className="muted">
        Listas aproximadas da era Duel Monsters. Ao importar, o deck vira um rascunho privado seu; cartas que a era não tem
        ou que passam do limite da lista são ajustadas e anotadas na descrição.
      </p>
      <ul className="anime-decks">
        {data.map((d) => (
          <li key={d.slug} className="anime-deck">
            {d.coverImageUrl ? <Image src={d.coverImageUrl} alt="" width={118} height={172} unoptimized /> : null}
            <div>
              <h3>{d.character}</h3>
              <p className="muted">{d.series}</p>
              <p>{d.description}</p>
              <p className="muted">
                {d.cardCount} cartas
                {d.missing.length ? ` · ${d.missing.length} fora da era` : ""}
              </p>
              <form action={importAnimeDeck.bind(null, d.slug)}>
                <SubmitButton pending="Importando…">Importar para meus decks</SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}