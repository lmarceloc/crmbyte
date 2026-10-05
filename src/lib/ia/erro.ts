/** Erro de uma etapa da IA (Firecrawl/OpenRouter) com mensagem já pronta para o usuário. */
export class IaError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly code: string = "ia_error",
  ) {
    super(message);
  }
}
