"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, Sparkles } from "lucide-react";
import type { PipelineStage } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LIMITES_DA_ANALISE } from "@/lib/pipeline/config";
import {
  alternarCriterio,
  CRITERIOS_DE_IA,
  CRITERIOS_DE_REGRA,
  EQUILIBRADO,
  INFO_DOS_CRITERIOS,
  type Criterio,
} from "@/lib/pipeline/criterios";
import type { ModoDaIa, PedidoDeAnalise } from "./use-analisar-deals";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PipelineStage[];
  /** `profiles.id` do usuário (para "só os meus"); null = indisponível. */
  meuPerfilId: string | null;
  /** Critérios e filtros da última análise (volta como estava). */
  inicial: PedidoDeAnalise | null;
  onAnalisar: (pedido: PedidoDeAnalise) => void;
}

/** Que IA existe agora, lida da configuração ao abrir o modal. */
function useModoDaIa(aberto: boolean) {
  const [modo, setModo] = useState<ModoDaIa | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const ctrl = new AbortController();
    void fetch("/api/analisar-deals/config", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setModo((d?.ia?.modo as ModoDaIa | undefined) ?? "nenhuma"))
      .catch(() => {
        if (!ctrl.signal.aborted) setModo("nenhuma");
      });
    return () => ctrl.abort();
  }, [aberto]);
  return modo;
}

function Chip({
  ativo,
  desativado,
  onClick,
  children,
  titulo,
}: {
  ativo: boolean;
  desativado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      disabled={desativado}
      title={titulo}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        ativo
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function AnalisarDealsDialog({ open, onOpenChange, stages, meuPerfilId, inicial, onAnalisar }: Props) {
  const modo = useModoDaIa(open);
  const [criterios, setCriterios] = useState<Criterio[]>(inicial?.criterios ?? EQUILIBRADO);
  const [etapas, setEtapas] = useState<string[]>(inicial?.etapas ?? []);
  const [soMeus, setSoMeus] = useState(!!inicial?.responsavel);

  // ao abrir, volta para a última análise (ou o equilibrado)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setCriterios(inicial?.criterios ?? EQUILIBRADO);
      setEtapas(inicial?.etapas ?? []);
      setSoMeus(!!inicial?.responsavel);
    }, 0);
    return () => clearTimeout(t);
  }, [open, inicial]);

  const iaIndisponivel = modo === "nenhuma";
  const usaIa = criterios.some((c) => INFO_DOS_CRITERIOS[c].usaIa);
  const ordenadas = [...stages].sort((a, b) => a.position - b.position);

  function analisar() {
    // sem IA disponível, os critérios de IA ficam de fora em vez de falhar
    const escolhidos = iaIndisponivel ? criterios.filter((c) => !INFO_DOS_CRITERIOS[c].usaIa) : criterios;
    onAnalisar({ criterios: escolhidos, etapas, responsavel: soMeus ? meuPerfilId : null });
    onOpenChange(false);
  }

  const alternarEtapa = (id: string) => setEtapas((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto border-border bg-popover sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <Sparkles className="size-4 text-primary" />
            Analisar Deals
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Escolha o que mais importa agora. O CRM ordena os negócios em aberto e mostra o que fazer primeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          <section aria-labelledby="ad-criterios">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="ad-criterios" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O que analisar
              </h3>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCriterios(EQUILIBRADO)}>
                  Equilibrado
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCriterios([])} disabled={criterios.length === 0}>
                  Limpar
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {CRITERIOS_DE_REGRA.map((c) => (
                <Chip
                  key={c}
                  ativo={criterios.includes(c)}
                  titulo={INFO_DOS_CRITERIOS[c].descricao}
                  onClick={() => setCriterios((atual) => alternarCriterio(atual, c))}
                >
                  {INFO_DOS_CRITERIOS[c].rotulo}
                </Chip>
              ))}
            </div>
          </section>

          <section aria-labelledby="ad-ia">
            <h3 id="ad-ia" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3 text-primary" />
              Com IA
            </h3>
            <div className="flex flex-wrap gap-2">
              {CRITERIOS_DE_IA.map((c) => (
                <Chip
                  key={c}
                  ativo={criterios.includes(c)}
                  desativado={iaIndisponivel}
                  titulo={INFO_DOS_CRITERIOS[c].descricao}
                  onClick={() => setCriterios((atual) => alternarCriterio(atual, c))}
                >
                  {INFO_DOS_CRITERIOS[c].rotulo}
                  <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase text-primary">IA</span>
                </Chip>
              ))}
            </div>
            {iaIndisponivel && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Cadastre a chave do Analisar Deals (ou a do OpenRouter) em Configurações → Chaves de API para usar a IA.
              </p>
            )}
            {modo === "reduzido" && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Modo reduzido (modelo gratuito): a IA avalia só os {LIMITES_DA_ANALISE.modoReduzido} primeiros negócios, de forma estimada.
              </p>
            )}
          </section>

          <section aria-labelledby="ad-filtros" className="space-y-3">
            <h3 id="ad-filtros" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quais negócios
            </h3>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Etapas {etapas.length === 0 ? "(todas)" : `(${etapas.length} escolhida${etapas.length === 1 ? "" : "s"})`}
              </p>
              <div className="flex flex-wrap gap-2">
                {ordenadas.map((s) => (
                  <Chip key={s.id} ativo={etapas.includes(s.id)} onClick={() => alternarEtapa(s.id)}>
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ad-so-meus" checked={soMeus} onCheckedChange={setSoMeus} disabled={!meuPerfilId} />
              <Label htmlFor="ad-so-meus" className="text-sm text-foreground">
                Só os meus negócios
              </Label>
            </div>
          </section>

          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Analisa no máximo {LIMITES_DA_ANALISE.negocios} negócios em aberto por vez.
            {usaIa &&
              " Nos critérios com IA, o texto das notas e das mensagens do cliente (sem e-mail nem telefone) é enviado a um serviço externo de análise."}
          </p>
        </div>

        <DialogFooter className="mt-4 border-border bg-popover/50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={analisar} disabled={criterios.length === 0 || modo === null}>
            {modo === null ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
            Analisar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
