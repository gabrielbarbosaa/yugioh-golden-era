"use client";

// Em produção o Next troca a mensagem de erros do servidor por um texto genérico (e o digest vai para o log),
// então mostramos uma frase fixa em vez de `error.message`.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <h1>Não foi possível carregar</h1>
      <p className="error">O Golden Era não conseguiu buscar os dados agora.</p>
      <p className="muted">Se o problema continuar, confira se a API está rodando (variável API_URL do site).</p>
      <button className="button" onClick={reset}>
        Tentar de novo
      </button>
    </>
  );
}
