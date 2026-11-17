/** mulberry32: gerador pequeno, rápido e determinístico. O estado é um uint32 guardado no `GameState`. */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Embaralha (Fisher-Yates) sem alterar a entrada e devolve o novo estado do gerador. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { items: out, state: s };
}

/** Gerador com estado interno, para bots e simulações (separado do estado do jogo). */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };
}
