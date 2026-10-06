// Critérios do "Analisar Deals": o que o modal oferece para ordenar os negócios.
// Uns saem de regras sobre os dados do CRM (instantâneos, sem custo); outros
// pedem um julgamento de texto à IA (notas, observações, mensagens do cliente).

export const CRITERIOS_DE_REGRA = [
  "sem_contato",
  "sem_atualizacao",
  "parado_na_etapa",
  "maior_valor",
  "menor_valor",
  "aberturas",
  "resposta_sem_acao",
  "fechamento_proximo",
  "sem_proxima_tarefa",
  "temperatura",
] as const;

export const CRITERIOS_DE_IA = ["intencao_de_compra", "urgencia_do_cliente", "risco_de_perda"] as const;

export const CRITERIOS = [...CRITERIOS_DE_REGRA, ...CRITERIOS_DE_IA] as const;

export type CriterioDeRegra = (typeof CRITERIOS_DE_REGRA)[number];
export type CriterioDeIa = (typeof CRITERIOS_DE_IA)[number];
export type Criterio = CriterioDeRegra | CriterioDeIa;

export interface InfoDoCriterio {
  rotulo: string;
  descricao: string;
  usaIa: boolean;
  pesoPadrao: number;
}

export const INFO_DOS_CRITERIOS: Record<Criterio, InfoDoCriterio> = {
  sem_contato: {
    rotulo: "Mais tempo sem contato",
    descricao: "Há quanto tempo ninguém fala com o cliente (conversa, e-mail, tarefa ou nota).",
    usaIa: false,
    pesoPadrao: 3,
  },
  sem_atualizacao: {
    rotulo: "Menos atualizações",
    descricao: "Negócios que ninguém mexe há mais tempo.",
    usaIa: false,
    pesoPadrao: 1.5,
  },
  parado_na_etapa: {
    rotulo: "Parado na etapa",
    descricao: "Tempo desde que o negócio entrou na etapa atual.",
    usaIa: false,
    pesoPadrao: 1.5,
  },
  maior_valor: {
    rotulo: "Maior valor",
    descricao: "Os negócios de maior valor entre os analisados.",
    usaIa: false,
    pesoPadrao: 2,
  },
  menor_valor: {
    rotulo: "Menor valor",
    descricao: "Os negócios de menor valor entre os analisados.",
    usaIa: false,
    pesoPadrao: 2,
  },
  aberturas: {
    rotulo: "Aberturas de e-mail",
    descricao: "Quanto o lead abriu os e-mails das cadências (leads quentes primeiro).",
    usaIa: false,
    pesoPadrao: 2,
  },
  resposta_sem_acao: {
    rotulo: "Resposta sem ação",
    descricao: "O cliente respondeu e nada foi feito depois.",
    usaIa: false,
    pesoPadrao: 3,
  },
  fechamento_proximo: {
    rotulo: "Fechamento próximo",
    descricao: "A previsão de fechamento está chegando ou já passou.",
    usaIa: false,
    pesoPadrao: 2.5,
  },
  sem_proxima_tarefa: {
    rotulo: "Sem próxima tarefa",
    descricao: "Nenhuma tarefa pendente para o negócio.",
    usaIa: false,
    pesoPadrao: 1,
  },
  temperatura: {
    rotulo: "Temperatura do negócio",
    descricao: "A temperatura marcada no negócio (quente e quase fechando primeiro).",
    usaIa: false,
    pesoPadrao: 1.5,
  },
  intencao_de_compra: {
    rotulo: "Intenção de compra",
    descricao: "A IA lê notas e mensagens e avalia o quanto o cliente quer comprar.",
    usaIa: true,
    pesoPadrao: 3,
  },
  urgencia_do_cliente: {
    rotulo: "Urgência do cliente",
    descricao: "A IA avalia se o cliente tem pressa ou prazo.",
    usaIa: true,
    pesoPadrao: 2,
  },
  risco_de_perda: {
    rotulo: "Risco de perda",
    descricao: "A IA avalia sinais de que o negócio pode ser perdido.",
    usaIa: true,
    pesoPadrao: 2.5,
  },
};

export function ehCriterio(v: unknown): v is Criterio {
  return typeof v === "string" && (CRITERIOS as readonly string[]).includes(v);
}

export function ehCriterioDeIa(c: Criterio): c is CriterioDeIa {
  return INFO_DOS_CRITERIOS[c].usaIa;
}

/** Pares que não fazem sentido juntos (um anularia o outro). */
const EXCLUSIVOS: Partial<Record<Criterio, Criterio>> = {
  maior_valor: "menor_valor",
  menor_valor: "maior_valor",
};

/** "Equilibrado": todos os critérios de regra, menos "menor valor" (que anularia "maior valor"). */
export const EQUILIBRADO: Criterio[] = CRITERIOS_DE_REGRA.filter((c) => c !== "menor_valor");

/** Liga ou desliga um critério; ligar "maior valor" desliga "menor valor" e vice-versa. */
export function alternarCriterio(escolhidos: Criterio[], criterio: Criterio): Criterio[] {
  if (escolhidos.includes(criterio)) return escolhidos.filter((c) => c !== criterio);
  const oposto = EXCLUSIVOS[criterio];
  return [...escolhidos.filter((c) => c !== oposto), criterio];
}
