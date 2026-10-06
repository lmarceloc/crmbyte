// Transforma as linhas do banco em sinais de cada negócio (para as regras do
// "Analisar Deals") e em um estado de texto para a IA ler. Funções puras.
import { differenceInCalendarDays } from "date-fns";
import { LIMIAR_LEAD_QUENTE_PADRAO } from "@/lib/cadencias/vocabulario";
import { diasNaEtapa } from "@/lib/deals/dias-na-etapa";
import type { DealTemperature } from "@/types";

export interface SinaisDoNegocio {
  id: string;
  titulo: string;
  empresa: string | null;
  contato: string | null;
  etapaId: string;
  etapa: string | null;
  responsavelId: string | null;
  valor: number;
  /** Moeda do negócio; null = a padrão da conta. */
  moeda: string | null;
  diasNaEtapa: number | null;
  diasSemAtualizar: number | null;
  /** Dias desde a última interação registrada; null = nenhuma até hoje. */
  diasSemContato: number | null;
  /** Maior número de aberturas de e-mail entre as inscrições do negócio. */
  aberturas: number;
  /** Algum lead do negócio atingiu o limite de aberturas da cadência. */
  leadQuente: boolean;
  /** Limite de aberturas da cadência onde `aberturas` é maior (padrão quando não há cadência). */
  limiarDeAberturas: number;
  /** Dias desde que o cliente respondeu sem que ninguém agisse depois; null = não se aplica. */
  diasRespostaSemAcao: number | null;
  /** Dias até a previsão de fechamento (negativo = já passou); null = sem previsão. */
  diasParaFechar: number | null;
  temperatura: DealTemperature | null;
  temTarefaPendente: boolean;
  /** Há observação, nota ou conversa para a IA ler (confirmado na hora de julgar). */
  temTextoParaIa: boolean;
}

type Um<T> = T | T[] | null | undefined;
const um = <T,>(v: Um<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export interface InscricaoBruta {
  aberturas: number | null;
  quente_em: string | null;
  ultimo_email_em: string | null;
  ultima_abertura_em: string | null;
  ultimo_clique_em: string | null;
  respondeu_em: string | null;
  email_cadences: Um<{ configuracao: { limiarLeadQuente?: unknown } | null }>;
}

export interface NegocioBruto {
  id: string;
  title: string;
  value: number | string | null;
  currency: string | null;
  notes: string | null;
  expected_close_date: string | null;
  temperature: string | null;
  stage_id: string;
  stage_entered_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  assigned_to: string | null;
  stage: Um<{ name: string | null }>;
  company: Um<{ name: string | null }>;
  /** O contato principal, com as notas e as conversas dele (WhatsApp). */
  contact: Um<{
    name: string | null;
    contact_notes: { created_at: string }[] | null;
    conversations: { last_message_at: string | null; last_message_text: string | null }[] | null;
  }>;
  enrollments: InscricaoBruta[] | null;
  tarefas: { status: string; concluida_em: string | null }[] | null;
}

const TEMPERATURAS: DealTemperature[] = ["sem_interesse", "frio", "morno", "quente", "quase_fechando"];

function maisRecente(datas: (string | null | undefined)[]): number | null {
  let melhor: number | null = null;
  for (const d of datas) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isNaN(t) && (melhor === null || t > melhor)) melhor = t;
  }
  return melhor;
}

/** `YYYY-MM-DD` como dia local (new Date("2026-10-06") seria meia-noite UTC e poderia cair no dia anterior). */
function diaLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function limiarDaInscricao(i: InscricaoBruta): number {
  const cfg = um(i.email_cadences)?.configuracao;
  const v = cfg?.limiarLeadQuente;
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : LIMIAR_LEAD_QUENTE_PADRAO;
}

/** Dados do próprio negócio (sem cadência, tarefa nem conversa), usados nos sinais e no estado da IA. */
export type ResumoDoNegocio = Pick<
  SinaisDoNegocio,
  "titulo" | "empresa" | "etapa" | "valor" | "moeda" | "diasNaEtapa" | "diasSemAtualizar"
>;

export function resumirNegocio(
  negocio: Pick<
    NegocioBruto,
    "title" | "value" | "currency" | "stage_entered_at" | "updated_at" | "created_at" | "stage" | "company"
  >,
  agora: Date = new Date(),
): ResumoDoNegocio {
  return {
    titulo: negocio.title,
    empresa: um(negocio.company)?.name ?? null,
    etapa: um(negocio.stage)?.name ?? null,
    valor: Number(negocio.value) || 0,
    moeda: negocio.currency || null,
    diasNaEtapa: diasNaEtapa(negocio.stage_entered_at ?? negocio.created_at, agora),
    diasSemAtualizar: diasNaEtapa(negocio.updated_at ?? negocio.created_at, agora),
  };
}

export function montarSinais(negocio: NegocioBruto, agora: Date = new Date()): SinaisDoNegocio {
  const contato = um(negocio.contact);
  const conversas = contato?.conversations ?? [];
  const ultimaMensagem = maisRecente(conversas.map((c) => c.last_message_at));
  const inscricoes = negocio.enrollments ?? [];
  const tarefas = negocio.tarefas ?? [];
  const datasDasNotas = (contato?.contact_notes ?? []).map((n) => n.created_at);
  const concluidas = tarefas.map((t) => t.concluida_em);

  const ultimoContato = maisRecente([
    ...(ultimaMensagem === null ? [] : [new Date(ultimaMensagem).toISOString()]),
    ...datasDasNotas,
    ...concluidas,
    ...inscricoes.flatMap((i) => [i.ultimo_email_em, i.ultima_abertura_em, i.ultimo_clique_em, i.respondeu_em]),
  ]);

  // resposta sem ação: o cliente respondeu e nada nosso (nota, tarefa concluída, mensagem ou e-mail) veio depois
  const respondeuEm = maisRecente(inscricoes.map((i) => i.respondeu_em));
  const ultimaAcaoNossa = maisRecente([
    ...(ultimaMensagem === null ? [] : [new Date(ultimaMensagem).toISOString()]),
    ...datasDasNotas,
    ...concluidas,
    ...inscricoes.map((i) => i.ultimo_email_em),
  ]);
  const respostaSemAcao = respondeuEm !== null && (ultimaAcaoNossa === null || ultimaAcaoNossa <= respondeuEm);

  let aberturas = 0;
  let limiar = LIMIAR_LEAD_QUENTE_PADRAO;
  for (const i of inscricoes) {
    const n = i.aberturas ?? 0;
    if (n > aberturas) {
      aberturas = n;
      limiar = limiarDaInscricao(i);
    }
  }

  const fechamento = negocio.expected_close_date ? diaLocal(negocio.expected_close_date) : null;
  const temperatura = TEMPERATURAS.find((t) => t === negocio.temperature) ?? null;
  const diasDesde = (ms: number | null) => (ms === null ? null : Math.max(0, differenceInCalendarDays(agora, new Date(ms))));

  return {
    ...resumirNegocio(negocio, agora),
    id: negocio.id,
    contato: contato?.name ?? null,
    etapaId: negocio.stage_id,
    responsavelId: negocio.assigned_to,
    diasSemContato: diasDesde(ultimoContato),
    aberturas,
    leadQuente: inscricoes.some((i) => !!i.quente_em),
    limiarDeAberturas: limiar,
    diasRespostaSemAcao: respostaSemAcao ? diasDesde(respondeuEm) : null,
    diasParaFechar: fechamento ? differenceInCalendarDays(fechamento, agora) : null,
    temperatura,
    temTarefaPendente: tarefas.some((t) => t.status === "pendente"),
    temTextoParaIa:
      !!negocio.notes?.trim() || datasDasNotas.length > 0 || conversas.some((c) => !!c.last_message_text?.trim()),
  };
}

// ---------------------------------------------------------------- texto para a IA

/** Máximos do que sai para o serviço externo (menos texto = menos custo e menos exposição). */
export const LIMITES_DO_TEXTO = {
  observacoes: 600,
  nota: 400,
  notas: 5,
  totalDasNotas: 1000,
  mensagem: 300,
  mensagens: 3,
} as const;

/**
 * Troca e-mails e telefones por marcadores: a IA não precisa deles para julgar e o
 * serviço externo não deve recebê-los. Valores em dinheiro ("R$ 1.250.000") ficam.
 */
export function ocultarContatos(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]")
    .replace(/\+?\(?\d[\d\s().-]{7,}\d/g, (trecho) => {
      const digitos = trecho.replace(/\D/g, "").length;
      const agrupado = /\d{4,5}[-\s]\d{4}/.test(trecho);
      return digitos >= 10 || (digitos >= 8 && agrupado) ? "[telefone]" : trecho;
    });
}

function aparar(texto: string | null | undefined, max: number): string {
  const limpo = ocultarContatos((texto ?? "").replace(/\s+/g, " ").trim());
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

const dia = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

export interface EstadoParaIa {
  negocio: {
    titulo: string;
    empresa: string | null;
    etapa: string | null;
    valor: number;
    moeda: string | null;
    dias_na_etapa: number | null;
    dias_sem_atualizar: number | null;
    previsao_de_fechamento: string | null;
    observacoes: string;
  };
  notas: { data: string | null; texto: string }[];
  mensagens_do_cliente: { data: string | null; texto: string }[];
}

export interface DadosParaOEstado {
  negocio: ResumoDoNegocio;
  previsaoDeFechamento: string | null;
  observacoes: string | null;
  /** Mais recentes primeiro. */
  notas: { created_at: string; note_text: string }[];
  /** Mensagens do cliente, mais recentes primeiro. */
  mensagens: { created_at: string; content_text: string | null }[];
}

/**
 * O que a IA recebe de um negócio: sem e-mail nem telefone e com texto truncado.
 * `temTexto` é falso quando não há nada para ler (o negócio não é enviado à IA).
 */
export function montarEstado(d: DadosParaOEstado): { estado: EstadoParaIa; temTexto: boolean } {
  const L = LIMITES_DO_TEXTO;
  let restante: number = L.totalDasNotas;
  const notas: EstadoParaIa["notas"] = [];
  for (const n of d.notas.slice(0, L.notas)) {
    if (restante <= 0) break;
    const texto = aparar(n.note_text, Math.min(L.nota, restante));
    if (!texto) continue;
    notas.push({ data: dia(n.created_at), texto });
    restante -= texto.length;
  }
  const mensagens = d.mensagens
    .map((m) => ({ data: dia(m.created_at), texto: aparar(m.content_text, L.mensagem) }))
    .filter((m) => m.texto)
    .slice(0, L.mensagens);
  const observacoes = aparar(d.observacoes, L.observacoes);

  const s = d.negocio;
  return {
    estado: {
      negocio: {
        titulo: aparar(s.titulo, 200),
        empresa: s.empresa ? aparar(s.empresa, 200) : null,
        etapa: s.etapa,
        valor: s.valor,
        moeda: s.moeda,
        dias_na_etapa: s.diasNaEtapa,
        dias_sem_atualizar: s.diasSemAtualizar,
        previsao_de_fechamento: d.previsaoDeFechamento,
        observacoes,
      },
      notas,
      mensagens_do_cliente: mensagens,
    },
    temTexto: !!observacoes || notas.length > 0 || mensagens.length > 0,
  };
}
