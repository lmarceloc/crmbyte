// Pesos e limites do "Analisar Deals" (Configurações → IA). Valores ausentes ou
// inválidos caem no padrão: a análise funciona mesmo sem nada configurado.
import { z } from "zod";
import { CRITERIOS, INFO_DOS_CRITERIOS, type Criterio } from "./criterios";

export interface ConfigAnalisarDeals {
  /** Peso de cada critério na média (0 = ignora). */
  pesos: Record<Criterio, number>;
  /** Dias sem contato para o critério chegar ao máximo. */
  diasSemContato: number;
  diasSemAtualizacao: number;
  diasParadoNaEtapa: number;
  /** Até quantos dias antes da previsão de fechamento o critério começa a pesar. */
  diasFechamentoProximo: number;
  /** Abaixo disto a resposta da IA é ignorada ("IA incerta"). */
  confiancaMinima: number;
}

/** Tamanhos fixos da análise (valem no servidor e na tela). */
export const LIMITES_DA_ANALISE = {
  /** Máximo de negócios analisados por vez. */
  negocios: 100,
  /** Negócios enviados à IA por requisição (cada uma cabe nos 60 s da Vercel). */
  porChamada: 20,
  /** No modo reduzido (modelo gratuito) só os primeiros por regra são julgados. */
  modoReduzido: 10,
  /** Negócios abertos lidos para escolher os melhores (acima disso o resto não entra na seleção). */
  candidatos: 1000,
} as const;

export const LIMITES_DA_CONFIG = {
  peso: { min: 0, max: 10 },
  dias: { min: 1, max: 365 },
  confianca: { min: 0, max: 1 },
} as const;

export const CONFIG_PADRAO: ConfigAnalisarDeals = {
  pesos: Object.fromEntries(CRITERIOS.map((c) => [c, INFO_DOS_CRITERIOS[c].pesoPadrao])) as Record<Criterio, number>,
  diasSemContato: 7,
  diasSemAtualizacao: 14,
  diasParadoNaEtapa: 14,
  diasFechamentoProximo: 7,
  confiancaMinima: 0.3,
};

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function numero(v: unknown, padrao: number, min: number, max: number, inteiro = false): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return padrao;
  const x = limitar(v, min, max);
  return inteiro ? Math.round(x) : x;
}

/** Lê o JSON salvo (ou qualquer coisa) e devolve uma configuração completa e dentro dos limites. */
export function normalizarConfig(bruto: unknown): ConfigAnalisarDeals {
  const o = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const pesosBrutos = o.pesos && typeof o.pesos === "object" ? (o.pesos as Record<string, unknown>) : {};
  const { peso, dias, confianca } = LIMITES_DA_CONFIG;
  return {
    pesos: Object.fromEntries(
      CRITERIOS.map((c) => [c, numero(pesosBrutos[c], CONFIG_PADRAO.pesos[c], peso.min, peso.max)]),
    ) as Record<Criterio, number>,
    diasSemContato: numero(o.diasSemContato, CONFIG_PADRAO.diasSemContato, dias.min, dias.max, true),
    diasSemAtualizacao: numero(o.diasSemAtualizacao, CONFIG_PADRAO.diasSemAtualizacao, dias.min, dias.max, true),
    diasParadoNaEtapa: numero(o.diasParadoNaEtapa, CONFIG_PADRAO.diasParadoNaEtapa, dias.min, dias.max, true),
    diasFechamentoProximo: numero(o.diasFechamentoProximo, CONFIG_PADRAO.diasFechamentoProximo, dias.min, dias.max, true),
    confiancaMinima: numero(o.confiancaMinima, CONFIG_PADRAO.confiancaMinima, confianca.min, confianca.max),
  };
}

const peso = z.number().min(LIMITES_DA_CONFIG.peso.min).max(LIMITES_DA_CONFIG.peso.max);
const dias = z.number().int().min(LIMITES_DA_CONFIG.dias.min).max(LIMITES_DA_CONFIG.dias.max);

/** Corpo aceito ao salvar: tudo obrigatório e dentro dos limites (a tela sempre manda a configuração inteira). */
export const configSchema = z
  .object({
    pesos: z.object(Object.fromEntries(CRITERIOS.map((c) => [c, peso])) as Record<Criterio, typeof peso>).strict(),
    diasSemContato: dias,
    diasSemAtualizacao: dias,
    diasParadoNaEtapa: dias,
    diasFechamentoProximo: dias,
    confiancaMinima: z.number().min(LIMITES_DA_CONFIG.confianca.min).max(LIMITES_DA_CONFIG.confianca.max),
  })
  .strict();
