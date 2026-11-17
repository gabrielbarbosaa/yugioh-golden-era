import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Não encontrado</h1>
      <p className="muted">Esta página não existe, ou o deck é privado.</p>
      <Link href="/" className="button">
        Ver cartas
      </Link>
    </>
  );
}
