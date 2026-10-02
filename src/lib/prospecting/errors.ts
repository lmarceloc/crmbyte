/** Erro de domínio: a mensagem já é legível e pode ir ao usuário. */
export class ProspectingError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
    this.name = "ProspectingError";
  }
}

export const MSG_SEM_CONFIRMACAO =
  "O provedor não confirmou a operação. Consulte o histórico antes de repetir uma busca.";

/**
 * O contato já existe e pediu para não ser contatado. O worker grava esta frase
 * no candidato que ele pulou por isso, e `avaliarImportacaoB2b` a reconhece:
 * quem pediu para sair NUNCA ganha contato novo por outro caminho.
 */
export const MSG_PEDIU_PARA_SAIR = "Este contato pediu para não ser contatado.";
