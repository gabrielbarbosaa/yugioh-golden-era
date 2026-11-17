/** Mensagem amigável para falhas de rede ou respostas de erro (problem+json) da API. */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const problem = error as { detail?: string; title?: string; errors?: { message?: string }[] };
    // Erros de validação (422) trazem uma lista com o motivo de cada campo.
    const reasons = (problem.errors ?? []).map((e) => e.message).filter(Boolean);
    if (reasons.length > 0) return reasons.join('\n');
    if (problem.detail) return problem.detail;
    if (problem.title) return problem.title;
  }
  if (error instanceof TypeError) {
    return 'Não foi possível falar com a API. Confira se ela está rodando e se EXPO_PUBLIC_API_URL está correta.';
  }
  return 'Algo deu errado. Tente de novo.';
}
