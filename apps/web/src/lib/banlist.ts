/** Rótulo da lista de proibidas/limitadas da era a partir do `maxCopies` (0 = proibida, 1 = limitada, 2 = semilimitada). */
export function banlistLabel(maxCopies: number): string | null {
  switch (maxCopies) {
    case 0:
      return "Proibida";
    case 1:
      return "Limitada";
    case 2:
      return "Semilimitada";
    default:
      return null; // 3 = sem restrição
  }
}