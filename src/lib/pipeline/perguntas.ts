// Perguntas que o "Analisar Deals" faz à IA, no formato do serviço de decisão
// (perguntas tipadas): cada Score mede uma dimensão numa escala de situações
// descritas em palavras; a Choice escolhe a próxima ação. O modelo não vê o id
// da pergunta nem o número do nível, então cada nível descreve uma SITUAÇÃO,
// nunca um grau ("baixo/médio/alto"). Textos centralizados aqui para ajuste.
import type { CriterioDeIa } from "./criterios";

/** Muda quando o texto de uma pergunta muda: invalida as respostas guardadas em cache. */
export const VERSAO_DAS_PERGUNTAS = 1;

export const ID_PROXIMA_ACAO = "proxima_acao";

export const ACOES = [
  "follow_up_hoje",
  "agendar_reuniao",
  "enviar_proposta",
  "confirmar_proximos_passos",
  "reativar",
  "aguardar",
  "nao_priorizar",
] as const;
export type AcaoSugerida = (typeof ACOES)[number];

export const ROTULO_DA_ACAO: Record<AcaoSugerida, string> = {
  follow_up_hoje: "Fazer follow-up hoje",
  agendar_reuniao: "Agendar reunião ou ligação",
  enviar_proposta: "Enviar ou revisar a proposta",
  confirmar_proximos_passos: "Confirmar os próximos passos para fechar",
  reativar: "Reativar o contato",
  aguardar: "Aguardar o retorno do cliente",
  nao_priorizar: "Não priorizar agora",
};

const DESCRICAO_DA_ACAO: Record<AcaoSugerida, string> = {
  follow_up_hoje:
    "Fazer follow-up hoje: o cliente demonstrou interesse e a conversa esfriou ou ficou sem resposta nossa.",
  agendar_reuniao:
    "Agendar uma reunião ou ligação: há interesse e dúvidas que se resolvem melhor conversando.",
  enviar_proposta:
    "Enviar ou revisar a proposta: o cliente pediu valores ou já está avaliando condições.",
  confirmar_proximos_passos:
    "Confirmar os próximos passos para fechar: o cliente já quer comprar e falta combinar prazo, contrato ou pagamento.",
  reativar:
    "Reativar o contato: o cliente sumiu e vale uma nova tentativa com uma abordagem diferente.",
  aguardar: "Aguardar: a bola está com o cliente, que pediu tempo ou ficou de retornar.",
  nao_priorizar:
    "Não priorizar agora: não há sinal de interesse ou o negócio parece perdido.",
};

export interface NivelDaPergunta {
  /** Texto curto mostrado ao usuário ("interesse claro"). */
  rotulo: string;
  /** Situação enviada ao modelo. */
  descricao: string;
}

interface DefinicaoDoScore {
  instrucoes: string;
  niveis: NivelDaPergunta[];
}

const CONTEXTO =
  "Você avalia um negócio de vendas B2B. O estado traz os dados do negócio (valor, etapa, tempo parado), as notas feitas pela equipe e as últimas mensagens do cliente. Use só o que está no estado; não invente fatos.";

export const PERGUNTAS_DE_SCORE: Record<CriterioDeIa, DefinicaoDoScore> = {
  intencao_de_compra: {
    instrucoes: `${CONTEXTO} Avalie o quanto o cliente demonstra querer comprar, olhando apenas o que ele disse e fez, não o quanto a equipe quer vender.`,
    niveis: [
      {
        rotulo: "sem sinal de compra",
        descricao:
          "Sem sinal de compra: não há conversa recente, o cliente não demonstrou interesse ou recusou a oferta.",
      },
      {
        rotulo: "curiosidade",
        descricao:
          "Curiosidade ou pesquisa: o cliente pediu informações gerais ou respondeu por educação, sem falar de preço, prazo ou decisão.",
      },
      {
        rotulo: "interesse claro",
        descricao:
          "Interesse claro com dúvidas: o cliente pergunta sobre preço, condições ou funcionamento e compara opções, mas ainda não decidiu.",
      },
      {
        rotulo: "pronto para fechar",
        descricao:
          "Pronto para fechar: o cliente pede proposta, contrato ou data de início, ou confirma que vai comprar.",
      },
    ],
  },
  urgencia_do_cliente: {
    instrucoes: `${CONTEXTO} Avalie a pressa do cliente: se ele tem prazo, evento ou necessidade que exige resposta rápida da equipe.`,
    niveis: [
      {
        rotulo: "sem pressa",
        descricao: "Sem pressa: o cliente não fala de prazo ou diz que só decide mais para frente.",
      },
      {
        rotulo: "prazo vago",
        descricao: "Prazo vago: o cliente diz que precisa resolver em algum momento, sem citar data.",
      },
      {
        rotulo: "prazo próximo",
        descricao: "Prazo próximo: o cliente cita uma data ou um evento nas próximas semanas.",
      },
      {
        rotulo: "urgente",
        descricao:
          "Urgente: o cliente precisa de resposta ou solução agora, nesta semana, ou já cobrou retorno da equipe.",
      },
    ],
  },
  risco_de_perda: {
    instrucoes: `${CONTEXTO} Avalie o risco de o negócio ser perdido, olhando sinais negativos do cliente e a falta de resposta dele.`,
    niveis: [
      {
        rotulo: "sem risco aparente",
        descricao: "Sem risco aparente: a conversa está ativa e o cliente responde normalmente.",
      },
      {
        rotulo: "atenção leve",
        descricao: "Atenção leve: o cliente demora para responder, mas não há nenhum sinal negativo.",
      },
      {
        rotulo: "risco real",
        descricao:
          "Risco real: o cliente citou concorrente, achou o preço alto, adiou a decisão ou deixou de responder depois de receber a proposta.",
      },
      {
        rotulo: "quase perdido",
        descricao:
          "Quase perdido: o cliente disse que vai escolher outro, cancelou ou sumiu depois de várias tentativas da equipe.",
      },
    ],
  },
};

export type PerguntaDoServico =
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

const INSTRUCOES_PROXIMA_ACAO = `${CONTEXTO} Escolha a próxima ação mais útil que o vendedor deve fazer neste negócio hoje.`;

/** Perguntas a enviar: uma por critério de IA escolhido, mais a próxima ação quando pedida. */
export function montarPerguntas(
  criterios: CriterioDeIa[],
  proximaAcao: boolean,
): Record<string, PerguntaDoServico> {
  const perguntas: Record<string, PerguntaDoServico> = {};
  for (const c of criterios) {
    const def = PERGUNTAS_DE_SCORE[c];
    perguntas[c] = { type: "score", instructions: def.instrucoes, criteria: def.niveis.map((n) => n.descricao) };
  }
  if (proximaAcao) {
    perguntas[ID_PROXIMA_ACAO] = {
      type: "choice",
      instructions: INSTRUCOES_PROXIMA_ACAO,
      criteria: Object.fromEntries(ACOES.map((a) => [a, DESCRICAO_DA_ACAO[a]])),
    };
  }
  return perguntas;
}

export function ehAcao(v: unknown): v is AcaoSugerida {
  return typeof v === "string" && (ACOES as readonly string[]).includes(v);
}

/** Último nível válido (a escala vai de 0 até aqui). */
export function ultimoNivel(c: CriterioDeIa): number {
  return PERGUNTAS_DE_SCORE[c].niveis.length - 1;
}

/** Normaliza o nível escolhido para 0–1 (`score ÷ (níveis − 1)`). */
export function notaDoNivel(c: CriterioDeIa, nivel: number): number {
  return Math.min(1, Math.max(0, nivel / ultimoNivel(c)));
}

export function rotuloDoNivel(c: CriterioDeIa, nivel: number): string {
  return PERGUNTAS_DE_SCORE[c].niveis[Math.round(nivel)]?.rotulo ?? "";
}
