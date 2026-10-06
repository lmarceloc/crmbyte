// Chamada ao serviço de decisão do "Analisar Deals" (server-only: a chave nunca
// sai daqui). O serviço não escreve texto: recebe um `state` e perguntas tipadas
// (score numa escala descrita; choice entre opções) e devolve a resposta de cada
// uma com a confiança. A URL é fixa (nenhum campo do usuário a altera) e
// redirecionamentos não são seguidos.
import { ID_PROXIMA_ACAO, ehAcao, type PerguntaDoServico, PERGUNTAS_DE_SCORE } from "@/lib/pipeline/perguntas";
import { CRITERIOS_DE_IA, type CriterioDeIa } from "@/lib/pipeline/criterios";
import type { RespostaDaIa } from "@/lib/pipeline/prioridade";
import { IaError } from "./erro";

export const URL_DO_SERVICO = "https://api.typesafe.ai/v1/systemone";
export const MODELO_DO_SERVICO = "jev-latest";
const TEMPO_MAX_MS = 20_000;
const TENTATIVAS = 3;
const ESPERAS_MS = [500, 1500];
const ESPERA_MAX_MS = 5_000;

export class ErroDoServico extends IaError {
  constructor(
    message: string,
    status: number,
    code: string,
    /** Vale tentar de novo (limite de uso, falha do servidor, tempo esgotado). */
    readonly tentarDeNovo: boolean,
    /** Espera pedida pelo serviço (cabeçalho Retry-After), em ms. */
    readonly esperaMs?: number,
  ) {
    super(message, status, code);
  }
}

export interface Uso {
  entrada: number;
  saida: number;
}

export interface Julgamento {
  resposta: RespostaDaIa;
  uso: Uso;
}

interface Opcoes {
  fetchFn?: typeof fetch;
  tempoMaxMs?: number;
  /** Troca a espera entre tentativas (testes). */
  dormir?: (ms: number) => Promise<void>;
  /** Hora (ms desde 1970) em que nenhuma chamada pode mais estar aberta: encurta o tempo limite e corta as novas tentativas. */
  prazoFinalMs?: number;
  /** Relógio (testes). */
  agora?: () => number;
}

const dormirDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tira da mensagem qualquer trecho que contenha a chave, por garantia. */
function resumo(v: unknown, chave: string): string {
  if (typeof v !== "string") return "";
  const limpo = v.replace(/\s+/g, " ").trim().slice(0, 200);
  return chave ? limpo.split(chave).join("***") : limpo;
}

/** Mensagem do corpo de erro, seja `{ error: { message } }` ou `{ error: "texto" }`. */
function mensagemDoErro(corpo: unknown): unknown {
  const e = (corpo as { error?: unknown } | null)?.error;
  return typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e;
}

const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Confiança válida (0–1) ou null quando o serviço não mandou um número utilizável. */
function confianca(v: unknown): number | null {
  return ehNumero(v) && v >= 0 && v <= 1 ? v : null;
}

/** Lê as respostas do serviço. Resposta fora do formato esperado é descartada (o critério fica "sem dados"). */
export function lerRespostas(corpo: unknown, perguntas: Record<string, PerguntaDoServico>): RespostaDaIa {
  const resposta: RespostaDaIa = { scores: {}, estimado: false };
  const respostas = (corpo as { answers?: Record<string, unknown> } | null)?.answers;
  if (!respostas || typeof respostas !== "object") return resposta;

  for (const c of CRITERIOS_DE_IA) {
    if (!perguntas[c]) continue;
    const r = respostas[c] as { type?: unknown; score?: unknown; confidence?: unknown } | undefined;
    const ultimo = PERGUNTAS_DE_SCORE[c].niveis.length - 1;
    const conf = confianca(r?.confidence);
    if (r?.type !== "score" || !ehNumero(r.score) || r.score < 0 || r.score > ultimo) continue;
    if (conf === null) continue; // sem confiança utilizável não dá para decidir se vale agir
    resposta.scores[c as CriterioDeIa] = { nivel: r.score, confianca: conf };
  }

  if (perguntas[ID_PROXIMA_ACAO]) {
    const r = respostas[ID_PROXIMA_ACAO] as { type?: unknown; choice?: unknown; confidence?: unknown } | undefined;
    const conf = confianca(r?.confidence);
    if (r?.type === "choice" && ehAcao(r.choice) && conf !== null) resposta.acao = { opcao: r.choice, confianca: conf };
  }
  return resposta;
}

function lerUso(corpo: unknown): Uso {
  const u = (corpo as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage;
  return { entrada: ehNumero(u?.input_tokens) ? u.input_tokens : 0, saida: ehNumero(u?.output_tokens) ? u.output_tokens : 0 };
}

/** Uma chamada ao serviço, sem repetir. Lança `ErroDoServico` com mensagem pronta para a tela. */
export async function perguntar(
  chave: string,
  estado: unknown,
  perguntas: Record<string, PerguntaDoServico>,
  opcoes: Opcoes = {},
): Promise<Julgamento> {
  const fetchFn = opcoes.fetchFn ?? fetch;
  const agora = opcoes.agora ?? Date.now;
  const tempoMax = Math.min(
    opcoes.tempoMaxMs ?? TEMPO_MAX_MS,
    opcoes.prazoFinalMs === undefined ? Infinity : Math.max(1_000, opcoes.prazoFinalMs - agora()),
  );
  let resposta: Response;
  try {
    resposta = await fetchFn(URL_DO_SERVICO, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO_DO_SERVICO, state: estado, questions: perguntas }),
      redirect: "error",
      signal: AbortSignal.timeout(tempoMax),
    });
  } catch (e) {
    const demorou = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroDoServico(
      demorou ? "O serviço de análise demorou demais para responder." : "Não foi possível falar com o serviço de análise.",
      504,
      "analisar_deals_unreachable",
      true,
    );
  }

  const corpo = (await resposta.json().catch(() => null)) as unknown;
  if (!resposta.ok) {
    const s = resposta.status;
    if (s === 401 || s === 403)
      throw new ErroDoServico(
        "Chave do Analisar Deals recusada. Confira em Configurações → Chaves de API.",
        502,
        "analisar_deals_key",
        false,
      );
    if (s === 429) {
      const pedido = Number(resposta.headers.get("retry-after"));
      throw new ErroDoServico(
        "Limite de uso do serviço de análise atingido. Tente de novo em instantes.",
        429,
        "analisar_deals_rate_limit",
        true,
        Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido * 1000, ESPERA_MAX_MS) : undefined,
      );
    }
    const detalhe = resumo(mensagemDoErro(corpo), chave);
    throw new ErroDoServico(
      `O serviço de análise não respondeu (HTTP ${s}${detalhe ? `: ${detalhe}` : ""}).`,
      502,
      "analisar_deals_failed",
      s >= 500,
    );
  }
  return { resposta: lerRespostas(corpo, perguntas), uso: lerUso(corpo) };
}

/** `perguntar` com novas tentativas (espera crescente) para limite de uso, falha do servidor e tempo esgotado. */
export async function perguntarComRetentativa(
  chave: string,
  estado: unknown,
  perguntas: Record<string, PerguntaDoServico>,
  opcoes: Opcoes = {},
): Promise<Julgamento> {
  const dormir = opcoes.dormir ?? dormirDeVerdade;
  const agora = opcoes.agora ?? Date.now;
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await perguntar(chave, estado, perguntas, opcoes);
    } catch (e) {
      if (!(e instanceof ErroDoServico) || !e.tentarDeNovo || tentativa >= TENTATIVAS) throw e;
      const espera = e.esperaMs ?? ESPERAS_MS[tentativa - 1] ?? ESPERAS_MS[ESPERAS_MS.length - 1];
      // sem tempo para esperar e tentar de novo antes do prazo: devolve o erro que já temos
      if (opcoes.prazoFinalMs !== undefined && agora() + espera + 1_000 >= opcoes.prazoFinalMs) throw e;
      await dormir(espera);
    }
  }
}
