"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Info, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { INFO_DOS_CRITERIOS } from "@/lib/pipeline/criterios";
import { ROTULO_DA_FAIXA, type FaixaDePrioridade, type ItemPrioritario } from "@/lib/pipeline/prioridade";
import type { EstadoDaAnalise } from "./use-analisar-deals";

/** Quantos itens aparecem antes de "Mostrar todos". */
const ITENS_VISIVEIS = 20;

const CLASSE_DA_FAIXA: Record<FaixaDePrioridade, { selo: string; barra: string }> = {
  critica: { selo: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400", barra: "bg-red-500" },
  alta: { selo: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400", barra: "bg-orange-500" },
  media: { selo: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", barra: "bg-yellow-500" },
  baixa: { selo: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400", barra: "bg-green-500" },
};

interface Props {
  estado: EstadoDaAnalise;
  itens: ItemPrioritario[];
  moedaPadrao: string;
  destaqueId: string | null;
  onAbrir: (dealId: string) => void;
  onFechar: () => void;
  onRefazer: () => void;
}

function Aviso({ children, tom = "info" }: { children: React.ReactNode; tom?: "info" | "alerta" }) {
  const Icone = tom === "alerta" ? AlertTriangle : Info;
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
        tom === "alerta"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <Icone className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

function Item({
  item,
  posicao,
  moedaPadrao,
  destacado,
  onAbrir,
}: {
  item: ItemPrioritario;
  posicao: number;
  moedaPadrao: string;
  destacado: boolean;
  onAbrir: (id: string) => void;
}) {
  const s = item.sinais;
  const cor = CLASSE_DA_FAIXA[item.faixa];
  const subtitulo = [s.empresa, s.etapa, formatCurrency(s.valor, s.moeda ?? moedaPadrao)].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(item.id)}
        data-prioridade={item.id}
        className={`group relative w-full overflow-hidden rounded-xl border bg-card p-3 pl-4 text-left transition-colors hover:bg-muted/60 ${
          destacado ? "border-primary ring-1 ring-primary" : "border-border"
        }`}
      >
        <span aria-hidden className={`absolute left-0 top-0 h-full w-1 ${cor.barra}`} />
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{posicao}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-snug text-foreground">{s.titulo}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>
          </div>
          <span
            title={`Prioridade ${ROTULO_DA_FAIXA[item.faixa].toLowerCase()}`}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${cor.selo}`}
          >
            {item.score}
          </span>
        </div>
        <ul className="mt-2 space-y-0.5 pl-7 text-xs text-muted-foreground">
          {item.motivos.map((m) => (
            <li key={m} className="flex gap-1.5">
              <span aria-hidden>•</span>
              <span>{m}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 pl-7 text-xs font-medium text-foreground">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            {item.acao}
            {item.acaoDaIa && (
              <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase text-primary">IA</span>
            )}
          </span>
        </p>
        {(item.iaIncerta || item.iaSemDados || item.estimado) && (
          <p className="mt-1.5 flex flex-wrap gap-1.5 pl-7 text-[10px] font-medium">
            {item.iaIncerta && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">IA incerta</span>}
            {item.iaSemDados && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {s.temTextoParaIa ? "IA não analisou" : "sem texto para a IA"}
              </span>
            )}
            {item.estimado && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">estimado</span>}
          </p>
        )}
      </button>
    </li>
  );
}

/**
 * "Analisar Deals — Prioridades de hoje": os negócios em ordem de atenção, com o motivo e a ação
 * sugerida. Em telas grandes fica ao lado do quadro; no celular cobre a tela.
 */
export function PainelDePrioridades({ estado, itens, moedaPadrao, destaqueId, onAbrir, onFechar, onRefazer }: Props) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const carregando = estado.fase === "lendo";
  const visiveis = mostrarTodos ? itens : itens.slice(0, ITENS_VISIVEIS);
  const escolhidos = estado.pedido?.criterios ?? [];
  const incertos = itens.filter((i) => i.iaIncerta).length;
  const semDadosIa = itens.filter((i) => i.iaSemDados && !i.sinais.temTextoParaIa).length;
  const estimados = itens.some((i) => i.estimado);
  const usouIa = escolhidos.some((c) => INFO_DOS_CRITERIOS[c].usaIa);

  return (
    <aside
      aria-label="Analisar Deals: prioridades de hoje"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[24rem] lg:shrink-0 lg:rounded-xl lg:border lg:border-border lg:bg-card/60"
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border p-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Prioridades de hoje</h2>
          <p className="text-xs text-muted-foreground">
            Analisar Deals
            {!carregando && ` · ${plural(estado.sinais.length, "negócio analisado", "negócios analisados")}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefazer} disabled={carregando || estado.fase === "analisando"} aria-label="Analisar de novo" title="Analisar de novo">
          <RefreshCw className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar painel">
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {carregando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Lendo os negócios…
          </p>
        )}

        {estado.fase === "erro" && <Aviso tom="alerta">{estado.erro}</Aviso>}

        {estado.fase === "analisando" && estado.progresso && (
          <div role="status" className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
            <p className="flex items-center gap-2 text-xs text-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              IA analisando {estado.progresso.feitos} de {estado.progresso.total}…
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${estado.progresso.total ? (estado.progresso.feitos / estado.progresso.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">A lista já vale pelas regras e se refina a cada bloco.</p>
          </div>
        )}

        {estado.erroDaIa && <Aviso tom="alerta">{estado.erroDaIa}</Aviso>}
        {estado.ficaramDeFora > 0 && (
          <Aviso>
            Há {plural(estado.total, "negócio", "negócios")} em aberto; os {estado.sinais.length} que mais pedem atenção foram analisados e {plural(estado.ficaramDeFora, "ficou", "ficaram")} de fora. Use os filtros (etapa ou “só os meus”) para olhar o resto.
          </Aviso>
        )}
        {usouIa && estado.modo === "reduzido" && (
          <Aviso>Modo reduzido: a IA gratuita avaliou só os primeiros negócios, de forma estimada.</Aviso>
        )}
        {usouIa && estado.pendentes + estado.falhas > 0 && (
          <Aviso tom="alerta">
            A IA não avaliou {plural(estado.pendentes + estado.falhas, "negócio", "negócios")} (limite de uso, tempo ou falha pontual); eles seguem ordenados pelas regras. Analise de novo: o que já foi analisado não é cobrado outra vez.
          </Aviso>
        )}
        {usouIa && estado.fase === "pronto" && (semDadosIa > 0 || incertos > 0 || estimados) && (
          <Aviso>
            {semDadosIa > 0 && `${plural(semDadosIa, "negócio sem texto", "negócios sem texto")} (notas ou mensagens) para a IA ler. `}
            {incertos > 0 && `${plural(incertos, "resposta da IA ignorada", "respostas da IA ignoradas")} por baixa confiança.`}
          </Aviso>
        )}

        {estado.fase === "pronto" && itens.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum negócio em aberto com esses filtros.
          </div>
        )}

        {itens.length > 0 && (
          <ol className="space-y-2">
            {visiveis.map((item, i) => (
              <Item key={item.id} item={item} posicao={i + 1} moedaPadrao={moedaPadrao} destacado={item.id === destaqueId} onAbrir={onAbrir} />
            ))}
          </ol>
        )}

        {itens.length > ITENS_VISIVEIS && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setMostrarTodos((v) => !v)}>
            {mostrarTodos ? "Mostrar só os 20 primeiros" : `Mostrar todos (${itens.length})`}
          </Button>
        )}
      </div>
    </aside>
  );
}
