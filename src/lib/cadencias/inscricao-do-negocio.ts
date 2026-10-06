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

/** Inscrição ATIVA em outra cadência, com o que identifica o lead. */
export interface InscricaoEmOutraCadencia {
  deal_id: string
  contact_id: string
  company_id: string | null
  cadencia: string
}

export interface Ocupacao {
  /** Nome da outra cadência. */
  cadencia: string
  motivo: "negocio" | "empresa" | "contato"
}

/**
 * Um lead fica numa cadência por vez: o negócio não pode ser inscrito se ele, a
 * empresa dele (por outro negócio) ou um dos contatos dele já tem inscrição
 * ATIVA em outra cadência. Inscrição concluída ou parada libera.
 */
export function ocupacaoEmOutraCadencia(
  negocio: { id: string; company_id: string | null; contatos: string[] },
  ativasEmOutras: InscricaoEmOutraCadencia[],
): Ocupacao | null {
  const doNegocio = ativasEmOutras.find((a) => a.deal_id === negocio.id)
  if (doNegocio) return { cadencia: doNegocio.cadencia, motivo: "negocio" }
  const daEmpresa = negocio.company_id ? ativasEmOutras.find((a) => a.company_id === negocio.company_id) : undefined
  if (daEmpresa) return { cadencia: daEmpresa.cadencia, motivo: "empresa" }
  const contatos = new Set(negocio.contatos)
  const doContato = ativasEmOutras.find((a) => contatos.has(a.contact_id))
  if (doContato) return { cadencia: doContato.cadencia, motivo: "contato" }
  return null
}

export function textoDaOcupacao(o: Ocupacao): string {
  const onde = `“${o.cadencia}”`
  if (o.motivo === "empresa") return `A empresa já está na cadência ${onde} (por outro negócio).`
  if (o.motivo === "contato") return `Um contato deste negócio já está na cadência ${onde}.`
  return `Já está na cadência ${onde}.`
}
