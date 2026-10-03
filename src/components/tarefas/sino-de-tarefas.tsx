"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AtSign, Bell, ListChecks } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CheckDaTarefa } from "@/components/tarefas/check-da-tarefa"
import { textoDoPrazo } from "@/components/tarefas/item-da-tarefa"
import { useDetailPanel } from "@/components/detail/detail-panel-provider"
import { useMencoes } from "@/hooks/use-mencoes"
import { useTarefas } from "@/hooks/use-tarefas"
import { ROTULO_TIPO_TAREFA, situacaoDoPrazo, umRegistro } from "@/lib/tarefas/tipos"

const MAX_NA_LISTA = 6

/**
 * Central de notificações (sininho do cabeçalho). O selo conta o que pede
 * atenção: tarefas novas ainda não vistas, atrasadas, as de hoje e @menções não
 * vistas. Clicar numa tarefa leva para /tarefas; numa menção, abre o negócio.
 */
export function SinoDeTarefas() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const { tarefas, carregando, alternar, marcarComoVistas } = useTarefas({ status: "pendente", escopo: "minhas" })
  const { open: abrirPainel } = useDetailPanel()
  const { mencoes, carregando: carregandoMencoes, marcarVista, marcarTodasVistas } = useMencoes()
  const jaVistas = useRef<Set<string> | null>(null)
  const mencoesJaVistas = useRef<Set<string> | null>(null)

  // Aviso (toast) quando alguém menciona você com a tela aberta.
  useEffect(() => {
    if (carregandoMencoes) return
    if (mencoesJaVistas.current === null) {
      mencoesJaVistas.current = new Set(mencoes.map((m) => m.id))
      return
    }
    const conhecidas = mencoesJaVistas.current
    for (const m of mencoes) {
      if (conhecidas.has(m.id)) continue
      conhecidas.add(m.id)
      if (!m.vista_em) {
        toast(`${m.autor_nome ?? "Alguém"} mencionou você`, { description: m.trecho })
      }
    }
  }, [mencoes, carregandoMencoes])

  // Aviso (toast) quando chega uma tarefa nova com a tela aberta.
  useEffect(() => {
    if (carregando) return
    if (jaVistas.current === null) {
      jaVistas.current = new Set(tarefas.map((t) => t.id))
      return
    }
    const vistas = jaVistas.current
    for (const t of tarefas) {
      if (vistas.has(t.id)) continue
      vistas.add(t.id)
      if (!t.vista_em) {
        toast("Nova tarefa", {
          description: t.titulo,
          action: { label: "Ver", onClick: () => router.push("/tarefas") },
        })
      }
    }
  }, [tarefas, carregando, router])

  const { atencao, pendentes } = useMemo(() => {
    const pend = tarefas.filter((t) => t.status === "pendente")
    const precisa = pend.filter((t) => {
      const s = situacaoDoPrazo(t.prazo_em)
      return !t.vista_em || s === "atrasada" || s === "hoje"
    })
    return { atencao: precisa.length, pendentes: pend }
  }, [tarefas])

  const mencoesNovas = mencoes.filter((m) => !m.vista_em).length
  const total = atencao + mencoesNovas
  const recentes = mencoes.slice(0, 4)

  function aoAbrir(v: boolean) {
    setAberto(v)
    if (v && pendentes.some((t) => !t.vista_em)) void marcarComoVistas()
    // as menções ficam marcadas (ponto) até você abrir/fechar o sino
    if (!v && mencoesNovas > 0) void marcarTodasVistas()
  }

  const rotulo = total > 0 ? `Notificações: ${total} item${total === 1 ? "" : "s"} precisa${total === 1 ? "" : "m"} de atenção` : "Notificações"

  return (
    <Popover open={aberto} onOpenChange={aoAbrir}>
      <PopoverTrigger
        aria-label={rotulo}
        title="Notificações"
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 p-0">
        {recentes.length > 0 && (
          <div className="border-b">
            <p className="px-3 pb-1 pt-2.5 text-sm font-semibold">Menções</p>
            <ul className="divide-y">
              {recentes.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                    onClick={() => {
                      void marcarVista(m.id)
                      setAberto(false)
                      if (m.deal_id) abrirPainel({ type: "deal", id: m.deal_id })
                      else if (m.contact_id) abrirPainel({ type: "contact", id: m.contact_id })
                    }}
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <AtSign className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.autor_nome ?? "Alguém"} mencionou você</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{m.trecho}</span>
                    </span>
                    {!m.vista_em && <span aria-label="Nova" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Tarefas</p>
          <span className="text-xs text-muted-foreground">
            {pendentes.length} pendente{pendentes.length === 1 ? "" : "s"}
          </span>
        </div>

        {pendentes.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa pendente. 🎉</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {pendentes.slice(0, MAX_NA_LISTA).map((t) => {
              const situacao = situacaoDoPrazo(t.prazo_em)
              const contato = umRegistro(t.contacts)
              return (
                <li key={t.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                  <CheckDaTarefa concluida={false} titulo={t.titulo} onToggle={() => void alternar(t)} className="mt-0.5" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setAberto(false)
                      router.push("/tarefas")
                    }}
                  >
                    <p className="line-clamp-2 text-sm font-medium">{t.titulo}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ROTULO_TIPO_TAREFA[t.tipo]}
                      {contato?.name ? ` · ${contato.name}` : ""}
                    </p>
                    <p
                      className={cn(
                        "text-xs text-muted-foreground",
                        situacao === "atrasada" && "font-medium text-destructive",
                        situacao === "hoje" && "font-medium text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {textoDoPrazo(t.prazo_em)}
                    </p>
                  </button>
                  {!t.vista_em && <span aria-label="Nova" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => {
            setAberto(false)
            router.push("/tarefas")
          }}
          className="flex items-center justify-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted/50"
        >
          <ListChecks className="size-4" /> Ver todas as tarefas
          {pendentes.length > MAX_NA_LISTA ? ` (+${pendentes.length - MAX_NA_LISTA})` : ""}
        </button>
      </PopoverContent>
    </Popover>
  )
}
