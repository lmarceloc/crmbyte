"use client"

import { Briefcase, Phone, PhoneCall, Mail, MessageCircle, CalendarClock, ListChecks, Workflow, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDetailPanel } from "@/components/detail/detail-panel-provider"
import { CheckDaTarefa } from "@/components/tarefas/check-da-tarefa"
import {
  ROTULO_TIPO_TAREFA,
  situacaoDoPrazo,
  umRegistro,
  type Tarefa,
  type TipoDeTarefa,
} from "@/lib/tarefas/tipos"

const ICONE_TIPO: Record<TipoDeTarefa, LucideIcon> = {
  retornar_ligacao: PhoneCall,
  ligacao: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  reuniao: CalendarClock,
  outra: ListChecks,
}

export function textoDoPrazo(prazoEm: string | null, agora = new Date()): string {
  if (!prazoEm) return "Sem prazo"
  const d = new Date(prazoEm)
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  switch (situacaoDoPrazo(prazoEm, agora)) {
    case "hoje":
      return `Hoje, ${hora}`
    case "atrasada":
      return `Atrasada · ${dia}, ${hora}`
    default:
      return `${dia}, ${hora}`
  }
}

/**
 * Linha de tarefa. `saindo` recolhe a linha com transição (usada pela tela de
 * Tarefas logo após o check, antes de a tarefa migrar para "Concluídas").
 */
export function ItemDaTarefa({
  tarefa,
  onToggle,
  saindo = false,
  mostrarVinculo = true,
}: {
  tarefa: Tarefa
  onToggle: (t: Tarefa) => void
  saindo?: boolean
  mostrarVinculo?: boolean
}) {
  const { open } = useDetailPanel()
  const concluida = tarefa.status === "concluida"
  const contato = umRegistro(tarefa.contacts)
  const negocio = umRegistro(tarefa.deals)
  const Icone = ICONE_TIPO[tarefa.tipo] ?? ListChecks
  const situacao = concluida ? "futura" : situacaoDoPrazo(tarefa.prazo_em)

  return (
    <li
      className={cn(
        "grid transition-all duration-500 ease-out",
        saindo ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors duration-500",
            concluida && "border-emerald-500/30 bg-emerald-500/5",
          )}
        >
          <CheckDaTarefa concluida={concluida} onToggle={() => onToggle(tarefa)} titulo={tarefa.titulo} className="mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p
              className={cn(
                "break-words text-sm font-medium transition-all duration-500",
                concluida && "text-muted-foreground line-through decoration-emerald-500/60",
              )}
            >
              {tarefa.titulo}
            </p>
            {tarefa.descricao && (
              <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{tarefa.descricao}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Icone className="size-3" /> {ROTULO_TIPO_TAREFA[tarefa.tipo]}
              </span>
              <span
                className={cn(
                  situacao === "atrasada" && "font-medium text-destructive",
                  situacao === "hoje" && "font-medium text-amber-600 dark:text-amber-400",
                )}
              >
                {concluida && tarefa.concluida_em
                  ? `Concluída em ${new Date(tarefa.concluida_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : textoDoPrazo(tarefa.prazo_em)}
              </span>
              {tarefa.origem === "cadencia" && (
                <span className="inline-flex items-center gap-1">
                  <Workflow className="size-3" /> Cadência
                </span>
              )}
              {mostrarVinculo && contato && (
                <button type="button" className="text-primary hover:underline" onClick={() => open({ type: "contact", id: contato.id })}>
                  {contato.name || "Contato"}
                </button>
              )}
              {mostrarVinculo && negocio && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={() => open({ type: "deal", id: negocio.id })}
                >
                  <Briefcase className="size-3" /> {negocio.title || "Negócio"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
