import { banlistLabel } from "@/lib/banlist";

const KIND = ["forbidden", "limited", "semi"] as const;

/**
 * Selo da lista da era, como no jogo: o número de cópias permitidas (0 vira ✕).
 * Não mostra nada para cartas sem restrição (`maxCopies` 3).
 */
export function LimitBadge({ maxCopies }: { maxCopies: number }) {
  const label = banlistLabel(maxCopies);
  if (!label) return null;
  return (
    <span className={`limit-badge ${KIND[maxCopies]}`} role="img" aria-label={label} title={label}>
      {maxCopies === 0 ? "✕" : maxCopies}
    </span>
  );
}
