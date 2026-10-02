/** Erro de domínio: a mensagem já é legível e pode ir ao usuário. */
export class ProspectingError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
    this.name = "ProspectingError";
  }
}

export const MSG_SEM_CONFIRMACAO =
  "O provedor não confirmou a operação. Consulte o histórico antes de repetir uma busca.";
