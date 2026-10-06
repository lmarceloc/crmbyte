// Contrato da cadência de e-mail. Tela, API e worker leem pelos mesmos tipos
// (o schema Zod em schemas.ts é o espelho de validação destes tipos).
import { LIMIAR_LEAD_QUENTE_PADRAO } from "./vocabulario";

export type StatusDaCadencia = "rascunho" | "ativa" | "pausada";

export interface PassoEmail {
  id: string;
  tipo: "email";
  assunto: string;
  corpo: string;
  mesmaConversa: boolean;
}
export interface PassoEspera {
  id: string;
  tipo: "espera";
  diasUteis: number;
}
export type CondicaoDoRamo =
  | { tipo: "abriu"; vezes: number; dentroDeDias: number }
  | { tipo: "clicou"; dentroDeDias: number }
  | { tipo: "respondeu"; dentroDeDias: number };
export interface PassoRamo {
  id: string;
  tipo: "ramo";
  condicao: CondicaoDoRamo;
  sim: Passo[];
  nao: Passo[];
}
export interface PassoWhatsapp {
  id: string;
  tipo: "whatsapp";
  mensagem: string;
}
export interface PassoTarefa {
  id: string;
  tipo: "tarefa";
  titulo: string;
  prazoDias: number;
  /** Tipo da tarefa criada em /tarefas; ausente = "outra" (passos antigos). */
  tipoDaTarefa?: "retornar_ligacao" | "ligacao" | "email" | "whatsapp" | "reuniao" | "outra";
}
/** Fim deste caminho: colocado à mão; encerra a cadência para o lead. Sempre o último da lista. */
export interface PassoFim {
  id: string;
  tipo: "fim";
}
export type Passo =
  | PassoEmail
  | PassoEspera
  | PassoRamo
  | PassoWhatsapp
  | PassoTarefa
  | PassoFim;
export type TipoDePasso = Passo["tipo"];

/**
 * Caixas soltas no canvas (ainda fora do fluxo). Cada bloco é uma sequência
 * — como uma lista do fluxo, pode terminar em ramo ou em fim — posicionada
 * em (x, y). O worker ignora: só o que está ligado ao gatilho é executado.
 */
export interface BlocoSolto {
  id: string;
  x: number;
  y: number;
  passos: Passo[];
}

export type DiaDaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export interface ConfiguracaoDaCadencia {
  /** Nome da tag que segmenta o público (informativo + inscrição em massa). */
  tagDoSegmento: string;
  somenteEmailValidado: boolean;
  /** email_mailboxes.id; null = transporte da instalação (SMTP_* do .env). */
  caixaPadraoId: string | null;
  /** Janela em que o worker pode ENVIAR e-mail ("HH:MM", no `fuso`). */
  janela: { inicio: string; fim: string; dias: DiaDaSemana[] };
  fuso: string;
  /** Fatia DESTA cadência por caixa por dia. */
  limiteDiarioPorCaixa: number;
  /** Aberturas (somando todos os e-mails) para o lead entrar em "Leads quentes". */
  limiarLeadQuente: number;
  paradas: {
    respondeu: boolean;
    bounce: boolean;
    descadastro: boolean;
    ganhoOuPerdido: boolean;
  };
}

export interface Cadencia {
  id: string;
  account_id: string;
  name: string;
  status: StatusDaCadencia;
  configuracao: ConfiguracaoDaCadencia;
  passos: Passo[];
  /** Caixas soltas no canvas (migração 044); ausente em respostas antigas. */
  soltos?: BlocoSolto[];
  versao: number;
  created_at: string;
  updated_at: string;
}

export function configuracaoPadrao(): ConfiguracaoDaCadencia {
  return {
    tagDoSegmento: "",
    somenteEmailValidado: true,
    caixaPadraoId: null,
    janela: {
      inicio: "08:00",
      fim: "18:00",
      dias: ["seg", "ter", "qua", "qui", "sex"],
    },
    fuso: "America/Sao_Paulo",
    limiteDiarioPorCaixa: 40,
    limiarLeadQuente: LIMIAR_LEAD_QUENTE_PADRAO,
    paradas: {
      respondeu: true,
      bounce: true,
      descadastro: true,
      ganhoOuPerdido: true,
    },
  };
}
