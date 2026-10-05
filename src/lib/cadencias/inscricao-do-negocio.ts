// Estado de inscrição dos contatos de um negócio numa cadência.
//
// A inscrição é única por (cadência, negócio, contato) — a API ignora duplicados
// em QUALQUER status (ativa, concluída ou parada) —, então quem já tem linha não
// pode ser inscrito de novo, mesmo que a sequência dele já tenha acabado.

export interface ResumoDeInscricao {
  /** Contatos com e-mail que ainda não têm inscrição: é quantos o botão "Inscrever" vai inscrever. */
  pendentes: number
  /** Quando não há mais ninguém a inscrever: o texto do botão desabilitado. `null` = ainda dá para inscrever. */
  rotuloQuandoInscrito: "Em cadência" | "Já inscrito" | null
}

/**
 * @param elegiveis ids dos contatos do negócio que podem receber e-mail
 * @param statusDe status da inscrição do contato nesta cadência, ou undefined se não houver
 */
export function resumoDeInscricao(
  elegiveis: string[],
  statusDe: (contatoId: string) => string | undefined,
): ResumoDeInscricao {
  const jaInscritos = elegiveis.filter((id) => statusDe(id) !== undefined)
  const pendentes = elegiveis.length - jaInscritos.length
  if (elegiveis.length === 0 || pendentes > 0) return { pendentes, rotuloQuandoInscrito: null }
  const algumAtivo = jaInscritos.some((id) => statusDe(id) === "ativa")
  return { pendentes, rotuloQuandoInscrito: algumAtivo ? "Em cadência" : "Já inscrito" }
}

/** Texto curto da situação de UM contato já inscrito, para a lista de contatos do negócio. */
export function rotuloDoInscrito(status: string): string {
  return status === "ativa" ? "em cadência" : "já inscrito"
}
