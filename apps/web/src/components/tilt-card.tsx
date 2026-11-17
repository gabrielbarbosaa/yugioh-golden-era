"use client";

import { useRef, type ReactNode } from "react";

/**
 * Inclina o conteúdo em 3D seguindo o ponteiro (mouse ou toque) e passa um brilho por cima, como numa carta holográfica.
 *
 * Duas camadas: `.tilt-hit` recebe o mouse e nunca se transforma; `.tilt` (dentro) é a que gira. A posição do ponteiro
 * vem de `offsetX/offsetY`, que já é relativa ao alvo no espaço local dele, então continua certa mesmo com a carta
 * girada por um ancestral (como no leque da vitrine). O efeito é só visual (globals.css) e some com `prefers-reduced-motion`.
 */
export function TiltCard({ children, max = 12, className = "" }: { children: ReactNode; max?: number; className?: string }) {
  const hit = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const area = hit.current;
    const el = card.current;
    if (!area || !el || area.offsetWidth === 0 || area.offsetHeight === 0) return;
    const px = Math.min(1, Math.max(0, e.nativeEvent.offsetX / area.offsetWidth));
    const py = Math.min(1, Math.max(0, e.nativeEvent.offsetY / area.offsetHeight));
    el.style.setProperty("--ry", `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-(py - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    el.dataset.active = "1";
  }

  function leave() {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.active = "0";
  }

  return (
    <div ref={hit} className={`tilt-hit ${className}`} onPointerMove={move} onPointerLeave={leave}>
      <div ref={card} className="tilt" data-active="0">
        {children}
        <span className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
