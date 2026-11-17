import { createApiClient } from "@golden-era/api-client";

/**
 * URL da API Go (com o prefixo /v1). Só é lida no servidor: o site busca os dados ao renderizar,
 * então o navegador nunca chama a API (não depende de CORS). Defina `API_URL` em produção.
 */
export const API_URL = process.env.API_URL ?? "http://localhost:8080/v1";

/** Cliente anônimo: o site só mostra conteúdo público. */
export const api = createApiClient({ baseUrl: API_URL });

/** Transforma o corpo de erro (problem+json) da API numa frase para a tela. */
export function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const problem = error as { detail?: string; title?: string };
    if (problem.detail) return problem.detail;
    if (problem.title) return problem.title;
  }
  return "Algo deu errado ao falar com a API.";
}
