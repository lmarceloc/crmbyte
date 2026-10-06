"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG_PADRAO, LIMITES_DA_ANALISE, type ConfigAnalisarDeals } from "@/lib/pipeline/config";
import { ehCriterioDeIa, EQUILIBRADO, type Criterio, type CriterioDeIa } from "@/lib/pipeline/criterios";
import { calcularPrioridades, type ItemPrioritario, type RespostaDaIa } from "@/lib/pipeline/prioridade";
import type { SinaisDoNegocio } from "@/lib/pipeline/sinais";

export type ModoDaIa = "servico" | "reduzido" | "nenhuma";

export interface PedidoDeAnalise {
  criterios: Criterio[];
  /** Vazio = todas as etapas. */
  etapas: string[];
  /** `profiles.id` de quem tem os negócios (o botão "só os meus"). */
  responsavel: string | null;
}

export interface EstadoDaAnalise {
  fase: "ocioso" | "lendo" | "analisando" | "pronto" | "erro";
  pedido: PedidoDeAnalise | null;
  sinais: SinaisDoNegocio[];
  config: ConfigAnalisarDeals;
  modo: ModoDaIa;
  /** Negócios em aberto que batem com os filtros (antes do corte de 100). */
  total: number;
  ficaramDeFora: number;
  respostas: Record<string, RespostaDaIa>;
  /** Negócios que a IA não recebeu por não terem texto para ler. */
  semDados: number;
  /** Negócios que a IA não conseguiu julgar (falha pontual). */
  falhas: number;
  /** Negócios que não chegaram a ser enviados (limite de uso ou tempo). */
  pendentes: number;
  progresso: { feitos: number; total: number } | null;
  /** Falha ao ler os negócios (nada para mostrar). */
  erro: string | null;
  /** A IA falhou: as regras continuam valendo, e o painel explica o que faltou. */
  erroDaIa: string | null;
}

const INICIAL: EstadoDaAnalise = {
  fase: "ocioso",
  pedido: null,
  sinais: [],
  config: CONFIG_PADRAO,
  modo: "nenhuma",
  total: 0,
  ficaramDeFora: 0,
  respostas: {},
  semDados: 0,
  falhas: 0,
  pendentes: 0,
  progresso: null,
  erro: null,
  erroDaIa: null,
};

interface RespostaDosSinais {
  negocios: SinaisDoNegocio[];
  total: number;
  ficaram_de_fora: number;
  config: ConfigAnalisarDeals;
  ia: { modo: ModoDaIa };
}

interface RespostaDoJulgamento {
  resultados: Record<string, RespostaDaIa>;
  sem_dados: string[];
  falhas: { deal_id: string; motivo: string }[];
  pendentes: string[];
  /** O serviço recusou por limite de uso: os blocos seguintes não são pedidos. */
  limite_de_uso: boolean;
}

const abortou = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

async function lerJson<T>(r: Response): Promise<T & { error?: string }> {
  return ((await r.json().catch(() => ({}))) as T & { error?: string }) ?? ({} as T);
}

/**
 * Conduz o "Analisar Deals": lê os negócios do funil, mostra o resultado das regras na hora e,
 * se algum critério usa IA, pede o julgamento em blocos (o resultado vai sendo refeito a cada bloco).
 */
export function useAnalisarDeals(pipelineId: string) {
  const [estado, setEstado] = useState<EstadoDaAnalise>(INICIAL);
  const controle = useRef<AbortController | null>(null);

  const cancelar = useCallback(() => {
    controle.current?.abort();
    controle.current = null;
  }, []);

  const limpar = useCallback(() => {
    cancelar();
    setEstado(INICIAL);
  }, [cancelar]);

  // outro funil ou saída da página: descarta a análise (e para as chamadas em andamento)
  useEffect(() => {
    const t = setTimeout(() => setEstado(INICIAL), 0);
    return () => {
      clearTimeout(t);
      controle.current?.abort();
      controle.current = null;
    };
  }, [pipelineId]);

  const analisar = useCallback(
    async (pedido: PedidoDeAnalise) => {
      cancelar();
      const ctrl = new AbortController();
      controle.current = ctrl;
      const sigo = () => controle.current === ctrl;
      setEstado({ ...INICIAL, fase: "lendo", pedido });

      let lidos: RespostaDosSinais;
      try {
        const q = new URLSearchParams({ criterios: pedido.criterios.join(",") });
        if (pedido.etapas.length > 0) q.set("etapas", pedido.etapas.join(","));
        if (pedido.responsavel) q.set("responsavel", pedido.responsavel);
        const r = await fetch(`/api/pipelines/${pipelineId}/prioridades?${q}`, { cache: "no-store", signal: ctrl.signal });
        const d = await lerJson<RespostaDosSinais>(r);
        if (!r.ok) throw new Error(d.error ?? "Não foi possível ler os negócios do funil.");
        lidos = d;
      } catch (e) {
        if (abortou(e) || !sigo()) return;
        setEstado((s) => ({ ...s, fase: "erro", erro: e instanceof Error ? e.message : "Não foi possível ler os negócios do funil." }));
        return;
      }

      const criteriosDeIa = pedido.criterios.filter(ehCriterioDeIa) as CriterioDeIa[];
      const modo = lidos.ia.modo;
      const usaIa = criteriosDeIa.length > 0 && modo !== "nenhuma";
      setEstado((s) => ({
        ...s,
        fase: usaIa && lidos.negocios.length > 0 ? "analisando" : "pronto",
        sinais: lidos.negocios,
        config: lidos.config,
        modo,
        total: lidos.total,
        ficaramDeFora: lidos.ficaram_de_fora,
        erroDaIa:
          criteriosDeIa.length > 0 && modo === "nenhuma"
            ? "A IA não está configurada: cadastre a chave em Configurações → Chaves de API. Os critérios de IA ficaram de fora."
            : null,
      }));
      if (!usaIa || lidos.negocios.length === 0) return;

      // quem vai para a IA: os que têm texto, os melhores pelas regras primeiro; no modo reduzido só os 10 primeiros
      const regras = pedido.criterios.filter((c) => !ehCriterioDeIa(c));
      const ordem = calcularPrioridades(lidos.negocios, regras.length > 0 ? regras : EQUILIBRADO, lidos.config);
      const comTexto = ordem.filter((i) => i.sinais.temTextoParaIa).map((i) => i.id);
      const alvo = modo === "reduzido" ? comTexto.slice(0, LIMITES_DA_ANALISE.modoReduzido) : comTexto;
      const tamanho = modo === "reduzido" ? LIMITES_DA_ANALISE.modoReduzido : LIMITES_DA_ANALISE.porChamada;
      setEstado((s) => ({ ...s, progresso: { feitos: 0, total: alvo.length } }));

      for (let i = 0; i < alvo.length; i += tamanho) {
        const bloco = alvo.slice(i, i + tamanho);
        try {
          const r = await fetch(`/api/pipelines/${pipelineId}/julgar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deal_ids: bloco, criterios: criteriosDeIa, proxima_acao: true }),
            signal: ctrl.signal,
          });
          const d = await lerJson<RespostaDoJulgamento>(r);
          if (!sigo()) return;
          if (!r.ok) throw new Error(d.error ?? "A IA não respondeu.");
          setEstado((s) => ({
            ...s,
            respostas: { ...s.respostas, ...d.resultados },
            semDados: s.semDados + d.sem_dados.length,
            falhas: s.falhas + d.falhas.length,
            pendentes: s.pendentes + d.pendentes.length,
            progresso: { feitos: Math.min(alvo.length, i + bloco.length), total: alvo.length },
          }));
          if (d.limite_de_uso) {
            // sem insistir no serviço: o que falta fica pendente (a análise de novo aproveita o cache)
            const restantes = alvo.length - (i + bloco.length);
            setEstado((s) => ({ ...s, fase: "pronto", progresso: null, pendentes: s.pendentes + restantes }));
            return;
          }
        } catch (e) {
          if (abortou(e) || !sigo()) return;
          // a IA falhou: mantém o que já veio e as regras; não troca de serviço em silêncio
          setEstado((s) => ({
            ...s,
            fase: "pronto",
            progresso: null,
            erroDaIa: `${e instanceof Error ? e.message : "A IA não respondeu."} As regras continuam valendo.`,
          }));
          return;
        }
      }
      if (sigo()) setEstado((s) => ({ ...s, fase: "pronto", progresso: null }));
    },
    [pipelineId, cancelar],
  );

  const itens: ItemPrioritario[] = useMemo(
    () => (estado.pedido ? calcularPrioridades(estado.sinais, estado.pedido.criterios, estado.config, estado.respostas) : []),
    [estado.pedido, estado.sinais, estado.config, estado.respostas],
  );

  return { estado, itens, analisar, limpar, cancelar };
}
