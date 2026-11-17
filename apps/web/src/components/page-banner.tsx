import type { ReactNode } from "react";
import { Suspense } from "react";

import { ArtBackdrop } from "@/components/art-backdrop";

/**
 * Cabeçalho de página com título e um papel de parede feito da arte de uma carta.
 * O título fica no shell estático; a imagem chega por streaming dentro do Suspense.
 */
export function PageBanner({
  title,
  children,
  artCardId,
  side = "right",
}: {
  title: string;
  children?: ReactNode;
  artCardId: number;
  side?: "left" | "right";
}) {
  return (
    <header className="banner">
      <Suspense fallback={null}>
        <ArtBackdrop cardId={artCardId} side={side} />
      </Suspense>
      <div className="banner-text">
        <h1>{title}</h1>
        {children ? <div className="banner-sub muted">{children}</div> : null}
      </div>
    </header>
  );
}
