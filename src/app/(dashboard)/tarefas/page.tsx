"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ListChecks, Plus } from "lucide-react"

import { RequireRole } from "@/components/auth/require-role"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ItemDaTarefa } from "@/components/tarefas/item-da-tarefa"
import { NovaTarefaDialog } from "@/components/tarefas/nova-tarefa-dialog"
import { useTarefas } from "@/hooks/use-tarefas"
import { situacaoDoPrazo, type SituacaoDoPrazo, type Tarefa } from "@/lib/tarefas/tipos"

type Aba = "pendentes" | "concluidas"
type Escopo = "minhas" | "todas"

const GRUPOS: { chave: SituacaoDoPrazo; titulo: string; destaque?: string }[] = [
  { chave: "atrasada", titulo: "Atrasadas", destaque: "text-destructive" },
  { chave: "hoje", titulo: "Hoje", destaque: "text-amber-600 dark:text-amber-400" },
  { chave: "futura", titulo: "Próximas" },
  { chave: "sem_prazo", titulo: "Sem prazo" },
]

// Tempo que o item fica verde antes de recolher, e até sair da lista.
const MS_ATE_RECOLHER = 700
const MS_ATE_SAIR = 1250

function Segmento<T extends string>({
  valor,
  opcoes,
  onChange,
}: {
  valor: T
  opcoes: { valor: T; rotulo: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            valor === o.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

function Tarefas() {
  const [aba, setAba] = useState<Aba>("pendentes")
  const [escopo, setEscopo] = useState<Escopo>("minhas")
  const [criando, setCriando] = useState(false)
  // concluídas há pouco: continuam na lista pendente só para animar a saída
  const [recentes, setRecentes] = useState<Record<string, "verde" | "saindo">>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({})

  const pend = useTarefas({ status: "pendente", escopo })
  const conc = useTarefas({ status: "concluida", escopo, ativo: aba === "concluidas" })
  const { recarregar: recarregarConcluidas } = conc

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach((l) => l.forEach(clearTimeout))
  }, [])

  const limpar = useCallback((id: string) => {
    timers.current[id]?.forEach(clearTimeout)
    delete timers.current[id]
    setRecentes((r) => {
      const { [id]: _removido, ...resto } = r
      void _removido
      return resto
    })
  }, [])

  const alternarPendente = useCallback(
    async (t: Tarefa) => {
      // clicou de novo durante a animação: desfaz
      if (recentes[t.id]) {
        limpar(t.id)
        await pend.alternar({ ...t, status: "concluida" })
        return
      }
      setRecentes((r) => ({ ...r, [t.id]: "verde" }))
      timers.current[t.id] = [
        setTimeout(() => setRecentes((r) => (r[t.id] ? { ...r, [t.id]: "saindo" } : r)), MS_ATE_RECOLHER),
        setTimeout(() => {
          limpar(t.id)
          void recarregarConcluidas()
        }, MS_ATE_SAIR),
      ]
      const ok = await pend.alternar(t)
      if (!ok) limpar(t.id) // falhou: volta ao normal (o hook já reverteu)
    },
    [recentes, limpar, pend, recarregarConcluidas],
  )

  const reabrir = useCallback(
    async (t: Tarefa) => {
      await conc.alternar(t)
      void pend.recarregar()
      // some da lista de concluídas depois da transição
      setTimeout(() => void conc.recarregar(), MS_ATE_RECOLHER)
    },
    [conc, pend],
  )

  const visiveis = useMemo(
    () => pend.tarefas.filter((t) => t.status === "pendente" || recentes[t.id]),
    [pend.tarefas, recentes],
  )
  const porGrupo = useMemo(() => {
    const m: Record<SituacaoDoPrazo, Tarefa[]> = { atrasada: [], hoje: [], futura: [], sem_prazo: [] }
    for (const t of visiveis) m[situacaoDoPrazo(t.prazo_em)].push(t)
    return m
  }, [visiveis])

  const lista = aba === "pendentes" ? pend : conc
  const total = aba === "pendentes" ? visiveis.length : conc.tarefas.length

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ListChecks className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              Retornos de ligação e tarefas das cadências. Marque o check ao concluir — fica no histórico do contato e do negócio.
            </p>
          </div>
        </div>
        <Button onClick={() => setCriando(true)}>
          <Plus /> Nova tarefa
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmento
          valor={aba}
          onChange={setAba}
          opcoes={[
            { valor: "pendentes", rotulo: `Pendentes${pend.carregando ? "" : ` (${visiveis.filter((t) => t.status === "pendente").length})`}` },
            { valor: "concluidas", rotulo: "Concluídas" },
          ]}
        />
        <Segmento
          valor={escopo}
          onChange={setEscopo}
          opcoes={[
            { valor: "minhas", rotulo: "Minhas" },
            { valor: "todas", rotulo: "Da equipe" },
          ]}
        />
      </div>

      {lista.erro ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {lista.erro}{" "}
          <button type="button" className="underline" onClick={() => void lista.recarregar()}>
            Tentar de novo
          </button>
        </div>
      ) : lista.carregando ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {aba === "pendentes"
            ? "Tudo em dia. Crie uma tarefa ou adicione o passo “Tarefa” em uma cadência."
            : "Nenhuma tarefa concluída ainda."}
        </div>
      ) : aba === "pendentes" ? (
        <div className="space-y-5">
          {GRUPOS.filter((g) => porGrupo[g.chave].length > 0).map((g) => (
            <section key={g.chave} className="space-y-2">
              <h2 className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", g.destaque)}>
                {g.titulo} · {porGrupo[g.chave].filter((t) => t.status === "pendente").length}
              </h2>
              <ul className="space-y-2">
                {porGrupo[g.chave].map((t) => (
                  <ItemDaTarefa key={t.id} tarefa={t} saindo={recentes[t.id] === "saindo"} onToggle={alternarPendente} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {conc.tarefas.map((t) => (
            <ItemDaTarefa key={t.id} tarefa={t} onToggle={reabrir} />
          ))}
        </ul>
      )}

      <NovaTarefaDialog
        open={criando}
        onOpenChange={setCriando}
        onCriada={() => {
          setAba("pendentes")
          void pend.recarregar()
        }}
      />
    </div>
  )
}

export default function Page() {
  return (
    <RequireRole min="viewer">
      <Tarefas />
    </RequireRole>
  )
}
