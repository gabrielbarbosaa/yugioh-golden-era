/** Marca do Golden Era: uma pirâmide dourada com um olho. Desenho próprio e simples, sem relação com marcas oficiais. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="brand-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8c" />
          <stop offset="1" stopColor="#a87b0a" />
        </linearGradient>
      </defs>
      <path d="M16 2 30 28H2Z" fill="url(#brand-gold)" stroke="#5a3f00" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M16 11c5 0 8 5 8 5s-3 5-8 5-8-5-8-5 3-5 8-5Z" fill="#0a0919" />
      <circle cx="16" cy="16" r="3" fill="#f6dc8c" />
    </svg>
  );
}
