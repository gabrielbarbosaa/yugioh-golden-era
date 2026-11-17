import Image from "next/image";

import { api } from "@/lib/api";

/**
 * Papel de parede feito da ilustração de uma carta do catálogo: a imagem da carta é ampliada e posicionada para
 * mostrar só a área da arte (o quadro central), e uma máscara a funde com o fundo da página.
 * Usa só imagens que a própria API já serve; para trocar por arte sua, veja `.art-backdrop` em globals.css.
 */
export async function ArtBackdrop({ cardId, side = "right" }: { cardId: number; side?: "left" | "right" }) {
  const { data: card } = await api.GET("/cards/{cardId}", { params: { path: { cardId } } });
  if (!card) return null;
  return (
    <div className={`art-backdrop ${side}`} aria-hidden="true">
      <Image src={card.imageUrl} alt="" width={421} height={614} unoptimized />
    </div>
  );
}
