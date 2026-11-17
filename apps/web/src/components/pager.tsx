import Link from "next/link";

/** Monta `path?a=1&b=2`, ignorando parâmetros vazios. */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) qs.set(key, value);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Paginação por cursor: a API só informa a próxima página (a anterior é o "voltar" do navegador). */
export function Pager({ nextHref }: { nextHref: string | null }) {
  if (!nextHref) return null;
  return (
    <div className="pager">
      <Link href={nextHref} className="button">
        Próxima página →
      </Link>
    </div>
  );
}
