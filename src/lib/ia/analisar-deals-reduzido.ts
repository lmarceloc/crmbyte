// Modo reduzido do "Analisar Deals": sem a chave do serviço de decisão, o modelo
// gratuito do OpenRouter responde as MESMAS perguntas, em JSON, para poucos
// negócios de uma vez. Não há probabilidades, então a confiança não existe
// (`null`) e o resultado aparece marcado como "estimado".
import { CRITERIOS_DE_IA, type CriterioDeIa } from "@/lib/pipeline/criterios";
import { LIMITES_DA_ANALISE } from "@/lib/pipeline/config";
import type { RespostaDaIa } from "@/lib/pipeline/prioridade";
import { ACOES, ehAcao, ID_PROXIMA_ACAO, PERGUNTAS_DE_SCORE, ultimoNivel } from "@/lib/pipeline/perguntas";
import type { EstadoParaIa } from "@/lib/pipeline/sinais";
import { IaError } from "./erro";
import { completar } from "./openrouter";
import type { MensagemDoModelo } from "./prompt";

/** Quantos negócios o modelo gratuito julga por chamada (limites de minuto e de tamanho). */
export const MAX_NO_MODO_REDUZIDO: number = LIMITES_DA_ANALISE.modoReduzido;

export function montarMensagens(
  itens: { estado: EstadoParaIa }[],
  criterios: CriterioDeIa[],
  proximaAcao: boolean,
): MensagemDoModelo[] {
  const escalas = criterios
    .map((c) => {
      const niveis = PERGUNTAS_DE_SCORE[c].niveis.map((n, i) => `  ${i} = ${n.descricao}`).join("\n");
      return `"${c}" (número inteiro de 0 a ${ultimoNivel(c)}): ${PERGUNTAS_DE_SCORE[c].instrucoes}\n${niveis}`;
    })
    .join("\n\n");
  const acoes = proximaAcao ? `"${ID_PROXIMA_ACAO}": uma destas opções: ${ACOES.join(", ")}.` : "";
  const campos = [...criterios, ...(proximaAcao ? [ID_PROXIMA_ACAO] : [])].map((c) => `"${c}"`).join(", ");

  const system = [
    "Você avalia negócios de vendas B2B a partir dos dados de cada um. Use só o que está nos dados; não invente fatos.",
    "Responda SOMENTE com um array JSON, sem texto antes ou depois e sem markdown.",
    `Cada elemento tem o campo "i" (o índice do negócio recebido) e os campos ${campos}.`,
    escalas,
    acoes,
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = JSON.stringify(itens.map((it, i) => ({ i, ...it.estado })));
  return [
    { role: "system", content: system },
    { role: "user", content: `Negócios para avaliar:\n${user}` },
  ];
}

/** Acha o array JSON na resposta (o modelo às vezes envolve em ``` ou escreve uma frase antes). */
function extrairArray(texto: string): unknown[] | null {
  const ini = texto.indexOf("[");
  const fim = texto.lastIndexOf("]");
  if (ini < 0 || fim <= ini) return null;
  try {
    const v = JSON.parse(texto.slice(ini, fim + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Lê a resposta do modelo; devolve uma resposta por índice recebido (item inválido é descartado). */
export function lerLote(
  texto: string,
  quantidade: number,
  criterios: CriterioDeIa[],
  proximaAcao: boolean,
): (RespostaDaIa | null)[] {
  const saida: (RespostaDaIa | null)[] = new Array(quantidade).fill(null);
  const itens = extrairArray(texto);
  if (!itens) return saida;
  for (const bruto of itens) {
    const o = bruto as Record<string, unknown> | null;
    const i = o && typeof o === "object" ? o.i : undefined;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= quantidade || saida[i]) continue;
    const resposta: RespostaDaIa = { scores: {}, estimado: true };
    for (const c of CRITERIOS_DE_IA) {
      if (!criterios.includes(c)) continue;
      const v = o![c];
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= ultimoNivel(c)) {
        resposta.scores[c] = { nivel: n, confianca: null };
      }
    }
    if (proximaAcao && ehAcao(o![ID_PROXIMA_ACAO])) {
      resposta.acao = { opcao: o![ID_PROXIMA_ACAO] as (typeof ACOES)[number], confianca: null };
    }
    if (Object.keys(resposta.scores).length > 0 || resposta.acao) saida[i] = resposta;
  }
  return saida;
}

/** Julga até `MAX_NO_MODO_REDUZIDO` negócios numa chamada ao modelo gratuito. */
export async function julgarEmLote(
  chave: string,
  itens: { estado: EstadoParaIa }[],
  criterios: CriterioDeIa[],
  proximaAcao: boolean,
  fetchFn?: typeof fetch,
): Promise<(RespostaDaIa | null)[]> {
  if (itens.length > MAX_NO_MODO_REDUZIDO)
    throw new IaError(`O modo reduzido analisa no máximo ${MAX_NO_MODO_REDUZIDO} negócios por vez.`, 422, "analisar_deals_lote_grande");
  const texto = await completar(chave, montarMensagens(itens, criterios, proximaAcao), {
    temperatura: 0.2,
    maxTokens: 1200,
    fetchFn,
  });
  return lerLote(texto, itens.length, criterios, proximaAcao);
}
