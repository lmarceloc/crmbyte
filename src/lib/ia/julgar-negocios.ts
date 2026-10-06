// Orquestra o julgamento de um lote de negócios pela IA: cache por negócio e
// pergunta, uma chamada por negócio com concorrência limitada, retentativa,
// prazo total e resultado parcial. Sem Supabase nem rede aqui: tudo entra por
// parâmetro (o cache é uma interface), então dá para testar por inteiro.
import { createHash } from "node:crypto";
import { CRITERIOS_DE_IA, type CriterioDeIa } from "@/lib/pipeline/criterios";
import { ehAcao, ID_PROXIMA_ACAO, montarPerguntas, VERSAO_DAS_PERGUNTAS } from "@/lib/pipeline/perguntas";
import type { RespostaDaIa } from "@/lib/pipeline/prioridade";
import type { EstadoParaIa } from "@/lib/pipeline/sinais";
import { ErroDoServico, perguntarComRetentativa, type Uso } from "./analisar-deals";
import { julgarEmLote } from "./analisar-deals-reduzido";
import { mapComLimite } from "./concorrencia";

export type ModoDaIa = "servico" | "reduzido";

export const VALIDADE_DO_CACHE_MS = 24 * 60 * 60 * 1000;
export const CHAMADAS_SIMULTANEAS = 6;
/** Depois disto não se começa uma chamada nova (a rota tem 60 s no total). */
export const PRAZO_DO_LOTE_MS = 40_000;
/** Depois disto nenhuma chamada pode estar aberta: sobra tempo para gravar o cache e responder. */
export const PRAZO_DURO_DO_LOTE_MS = 52_000;

export interface NegocioParaJulgar {
  id: string;
  estado: EstadoParaIa;
}

/** Uma resposta guardada (uma pergunta de um negócio). */
export type RespostaGuardada =
  | { tipo: "score"; nivel: number; confianca: number | null }
  | { tipo: "choice"; opcao: string; confianca: number | null };

export interface CacheDeRespostas {
  /** Respostas ainda válidas (mesmo hash, dentro da validade), por `negocio|pergunta`. */
  ler(hashes: Map<string, string>, perguntas: string[]): Promise<Map<string, RespostaGuardada>>;
  gravar(linhas: { dealId: string; pergunta: string; hash: string; resposta: RespostaGuardada }[]): Promise<void>;
}

export const chaveDoCache = (dealId: string, pergunta: string) => `${dealId}|${pergunta}`;

/** Identifica o que foi enviado: se o negócio ou o texto das perguntas muda, a resposta guardada não vale mais. */
export function hashDoEstado(estado: EstadoParaIa, modo: ModoDaIa): string {
  return createHash("sha256")
    .update(JSON.stringify({ v: VERSAO_DAS_PERGUNTAS, modo, estado }))
    .digest("hex");
}

export function paraGuardadas(r: RespostaDaIa): Map<string, RespostaGuardada> {
  const m = new Map<string, RespostaGuardada>();
  for (const c of CRITERIOS_DE_IA) {
    const s = r.scores[c];
    if (s) m.set(c, { tipo: "score", nivel: s.nivel, confianca: s.confianca });
  }
  if (r.acao) m.set(ID_PROXIMA_ACAO, { tipo: "choice", opcao: r.acao.opcao, confianca: r.acao.confianca });
  return m;
}

export function deGuardadas(m: Map<string, RespostaGuardada>, estimado: boolean): RespostaDaIa {
  const r: RespostaDaIa = { scores: {}, estimado };
  for (const c of CRITERIOS_DE_IA) {
    const g = m.get(c);
    if (g?.tipo === "score") r.scores[c] = { nivel: g.nivel, confianca: g.confianca };
  }
  const a = m.get(ID_PROXIMA_ACAO);
  if (a?.tipo === "choice" && ehAcao(a.opcao)) r.acao = { opcao: a.opcao, confianca: a.confianca };
  return r;
}

export const temResposta = (r: RespostaDaIa) => Object.keys(r.scores).length > 0 || !!r.acao;

export interface ResultadoDoLote {
  /** Só negócios com pelo menos uma resposta. */
  respostas: Record<string, RespostaDaIa>;
  /** Negócios atendidos só com o que já estava guardado. */
  doCache: number;
  falhas: { dealId: string; motivo: string }[];
  /** Não chegaram a ser enviados (prazo ou limite de uso). */
  pendentes: string[];
  /** O serviço recusou por limite de uso: não adianta pedir mais blocos agora. */
  limiteAtingido: boolean;
  uso: Uso;
}

interface Comum {
  negocios: NegocioParaJulgar[];
  criterios: CriterioDeIa[];
  proximaAcao: boolean;
  cache: CacheDeRespostas;
  agora?: () => number;
}

const idsDasPerguntas = (criterios: CriterioDeIa[], proximaAcao: boolean) => [
  ...criterios,
  ...(proximaAcao ? [ID_PROXIMA_ACAO] : []),
];

/** Junta o que o cache já tem por negócio. */
function guardadasPorNegocio(negocios: NegocioParaJulgar[], ids: string[], lidas: Map<string, RespostaGuardada>) {
  const porNegocio = new Map<string, Map<string, RespostaGuardada>>();
  for (const n of negocios) {
    const m = new Map<string, RespostaGuardada>();
    for (const id of ids) {
      const g = lidas.get(chaveDoCache(n.id, id));
      if (g) m.set(id, g);
    }
    porNegocio.set(n.id, m);
  }
  return porNegocio;
}

export interface ParametrosDoServico extends Comum {
  chave: string;
  fetchFn?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  tempoMaxMs?: number;
  prazoMs?: number;
  prazoDuroMs?: number;
  simultaneas?: number;
}

/**
 * Julga com o serviço de decisão: uma chamada por negócio, só com as perguntas que o cache não
 * respondeu. Chave recusada interrompe o lote (lança); as demais falhas viram resultado parcial.
 */
export async function julgarComServico(p: ParametrosDoServico): Promise<ResultadoDoLote> {
  const agora = p.agora ?? Date.now;
  const prazoFinal = agora() + (p.prazoMs ?? PRAZO_DO_LOTE_MS);
  const prazoDuro = agora() + (p.prazoDuroMs ?? PRAZO_DURO_DO_LOTE_MS);
  const ids = idsDasPerguntas(p.criterios, p.proximaAcao);
  const hashes = new Map(p.negocios.map((n) => [n.id, hashDoEstado(n.estado, "servico")]));
  const guardadas = guardadasPorNegocio(p.negocios, ids, await p.cache.ler(hashes, ids));

  const resultado: ResultadoDoLote = { respostas: {}, doCache: 0, falhas: [], pendentes: [], limiteAtingido: false, uso: { entrada: 0, saida: 0 } };
  const novas: Parameters<CacheDeRespostas["gravar"]>[0] = [];
  let chaveRecusada: ErroDoServico | null = null;
  let limiteAtingido = false;

  await mapComLimite(p.negocios, p.simultaneas ?? CHAMADAS_SIMULTANEAS, async (n) => {
    const atuais = guardadas.get(n.id)!;
    const faltam = ids.filter((id) => !atuais.has(id));
    const guardar = () => {
      const r = deGuardadas(atuais, false);
      if (temResposta(r)) resultado.respostas[n.id] = r;
    };
    if (faltam.length === 0) {
      resultado.doCache++;
      return guardar();
    }
    if (chaveRecusada || limiteAtingido || agora() >= prazoFinal) {
      resultado.pendentes.push(n.id);
      return guardar();
    }
    try {
      const perguntas = montarPerguntas(
        p.criterios.filter((c) => faltam.includes(c)),
        faltam.includes(ID_PROXIMA_ACAO),
      );
      const j = await perguntarComRetentativa(p.chave, n.estado, perguntas, {
        fetchFn: p.fetchFn,
        dormir: p.dormir,
        tempoMaxMs: p.tempoMaxMs,
        prazoFinalMs: prazoDuro,
        agora,
      });
      resultado.uso.entrada += j.uso.entrada;
      resultado.uso.saida += j.uso.saida;
      for (const [pergunta, resposta] of paraGuardadas(j.resposta)) {
        atuais.set(pergunta, resposta);
        novas.push({ dealId: n.id, pergunta, hash: hashes.get(n.id)!, resposta });
      }
    } catch (e) {
      if (e instanceof ErroDoServico && e.code === "analisar_deals_key") chaveRecusada = e;
      else if (e instanceof ErroDoServico && e.code === "analisar_deals_rate_limit") limiteAtingido = true;
      resultado.falhas.push({ dealId: n.id, motivo: e instanceof Error ? e.message : "Falha ao consultar a IA." });
    }
    guardar();
  });

  if (novas.length > 0) await p.cache.gravar(novas);
  if (chaveRecusada) throw chaveRecusada;
  resultado.limiteAtingido = limiteAtingido;
  return resultado;
}

export interface ParametrosReduzidos extends Comum {
  chave: string;
  fetchFn?: typeof fetch;
}

/**
 * Julga com o modelo gratuito: uma única chamada para todos os negócios que o cache não cobre.
 * Falha do OpenRouter (`IaError`) sobe inteira: não há resultado parcial numa chamada só.
 */
export async function julgarReduzido(p: ParametrosReduzidos): Promise<ResultadoDoLote> {
  const ids = idsDasPerguntas(p.criterios, p.proximaAcao);
  const hashes = new Map(p.negocios.map((n) => [n.id, hashDoEstado(n.estado, "reduzido")]));
  const guardadas = guardadasPorNegocio(p.negocios, ids, await p.cache.ler(hashes, ids));
  const resultado: ResultadoDoLote = { respostas: {}, doCache: 0, falhas: [], pendentes: [], limiteAtingido: false, uso: { entrada: 0, saida: 0 } };

  const incompletos = p.negocios.filter((n) => ids.some((id) => !guardadas.get(n.id)!.has(id)));
  const julgados = incompletos.length
    ? await julgarEmLote(p.chave, incompletos, p.criterios, p.proximaAcao, p.fetchFn)
    : [];

  const novas: Parameters<CacheDeRespostas["gravar"]>[0] = [];
  incompletos.forEach((n, i) => {
    const r = julgados[i];
    if (!r) return;
    for (const [pergunta, resposta] of paraGuardadas(r)) {
      guardadas.get(n.id)!.set(pergunta, resposta);
      novas.push({ dealId: n.id, pergunta, hash: hashes.get(n.id)!, resposta });
    }
  });

  for (const n of p.negocios) {
    const r = deGuardadas(guardadas.get(n.id)!, true);
    if (temResposta(r)) resultado.respostas[n.id] = r;
    if (!incompletos.includes(n)) resultado.doCache++;
  }
  if (novas.length > 0) await p.cache.gravar(novas);
  return resultado;
}
