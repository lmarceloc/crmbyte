"use client"

import { useState } from "react"
import { CircleCheck, CirclePlus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ItemDaTarefa } from "@/components/tarefas/item-da-tarefa"
import { NovaTarefaDialog } from "@/components/tarefas/nova-tarefa-dialog"
import { useTarefas } from "@/hooks/use-tarefas"
import { ROTULO_TIPO_TAREFA, type Tarefa } from "@/lib/tarefas/tipos"

interface Marco {
  chave: string
  quando: string
  tipo: "criada" | "concluida"
  tarefa: Tarefa
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })

/**
 * Aba "Tarefas" do painel de um contato ou negócio: as tarefas abertas (com o
 * check) e, abaixo, o histórico em linha do tempo — criada / concluída.
 * `ativo` evita buscar/assinar o realtime enquanto a aba não é aberta.
 */
export function TarefasDoVinculo({
  contatoId,
  negocioId,
  ativo = true,
}: {
  contatoId?: string
  negocioId?: string
  ativo?: boolean
}) {
  const [criando, setCriando] = useState(false)
  const { tarefas, carregando, erro, recarregar, alternar } = useTarefas({
    escopo: "todas",
    contactId: contatoId,
    dealId: negocioId,
    ativo,
  })

  const abertas = tarefas.filter((t) => t.status === "pendente")
  const marcos: Marco[] = tarefas
    .flatMap((t): Marco[] => [
      { chave: `${t.id}:c`, quando: t.created_at, tipo: "criada", tarefa: t },
      ...(t.concluida_em ? [{ chave: `${t.id}:f`, quando: t.concluida_em, tipo: "concluida" as const, tarefa: t }] : []),
    ])
    .sort((a, b) => b.quando.localeCompare(a.quando))

  return (
    <div className="space-y-5">
      <Button size="sm" variant="outline" onClick={() => setCriando(true)}>
        <Plus /> Nova tarefa
      </Button>

      {erro ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erro}{" "}
          <button type="button" className="underline" onClick={() => void recarregar()}>
            Tentar de novo
          </button>
        </p>
      ) : carregando ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : tarefas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma tarefa ainda. Crie uma ou adicione o passo “Tarefa” em uma cadência.
        </p>
      ) : (
        <>
          {abertas.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abertas · {abertas.length}</h3>
              <ul className="space-y-2">
                {abertas.map((t) => (
                  <ItemDaTarefa key={t.id} tarefa={t} onToggle={(x) => void alternar(x)} mostrarVinculo={!!(contatoId && !negocioId)} />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico</h3>
            <ol className="relative space-y-4 border-l pl-5">
              {marcos.map((m) => {
                const feita = m.tipo === "concluida"
                const Icone = feita ? CircleCheck : CirclePlus
                return (
                  <li key={m.chave} className="relative text-sm">
                    <span
                      className={cn(
                        "absolute -left-[31px] flex size-5 items-center justify-center rounded-full bg-background ring-4 ring-background",
                        feita ? "text-emerald-500" : "text-muted-foreground",
                      )}
                    >
                      <Icone className="size-5" />
                    </span>
                    <p className="break-words">
                      <span className="font-medium">{feita ? "Tarefa concluída" : "Tarefa criada"}</span>
                      {" — "}
                      {m.tarefa.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROTULO_TIPO_TAREFA[m.tarefa.tipo]}
                      {!feita && m.tarefa.origem === "cadencia" ? " · pela cadência" : ""} · {dataHora(m.quando)}
                    </p>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}

      <NovaTarefaDialog
        open={criando}
        onOpenChange={setCriando}
        contatoId={contatoId}
        negocioId={negocioId}
        onCriada={() => void recarregar()}
      />
    </div>
  )
}
