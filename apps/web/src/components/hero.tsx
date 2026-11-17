import Image from "next/image";
import Link from "next/link";

import { ArtBackdrop } from "@/components/art-backdrop";
import { TiltCard } from "@/components/tilt-card";
import { api } from "@/lib/api";

// Cartas emblemáticas da era para a vitrine (da esquerda para a direita; a do meio fica na frente).
const FEATURED = [70781052, 74677422, 46986414, 89631139, 33396948];
// Arte de fundo da vitrine: Blue-Eyes White Dragon.
const WALLPAPER = 89631139;

/** Vitrine da página inicial: título, atalhos e um leque de cartas em 3D sobre um papel de parede. */
export async function Hero() {
  const { data } = await api.GET("/cards", { params: { query: { ids: FEATURED, limit: 10 } } });
  const byId = new Map((data?.items ?? []).map((c) => [c.id, c]));
  const cards = FEATURED.map((id) => byId.get(id)).filter((c) => c !== undefined);

  return (
    <section className="hero" aria-label="Apresentação">
      <ArtBackdrop cardId={WALLPAPER} side="right" />
      <div>
        <h1>A era dos Duel Monsters</h1>
        <p>
          Explore todas as cartas lançadas até 2003, monte seu deck respeitando a lista de proibidas e limitadas da época e
          compartilhe com a comunidade.
        </p>
        <div className="hero-actions">
          <Link href="/decks" className="button">
            Ver decks
          </Link>
          <Link href="/banlist" className="button ghost">
            Lista da era
          </Link>
        </div>
      </div>
      <div className="fan" aria-hidden="true">
        {cards.map((c) => (
          <div key={c.id} className="fan-card">
            <div className="fan-card-inner">
              <TiltCard max={14}>
                <Image src={c.imageSmallUrl} alt="" width={190} height={277} unoptimized priority />
              </TiltCard>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
