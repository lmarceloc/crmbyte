"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Caixa de conclusão: círculo vazio; ao clicar vira verde com o check
 * "desenhando" por transição. Controlada — quem chama decide o estado.
 */
export function CheckDaTarefa({
  concluida,
  onToggle,
  titulo,
  className,
}: {
  concluida: boolean
  onToggle: () => void
  titulo: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={concluida}
      aria-label={concluida ? `Reabrir tarefa: ${titulo}` : `Concluir tarefa: ${titulo}`}
      onClick={onToggle}
      className={cn(
        "group relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ease-out",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90",
        concluida
          ? "scale-105 border-emerald-500 bg-emerald-500 text-white shadow-[0_0_0_4px] shadow-emerald-500/15"
          : "border-muted-foreground/40 bg-transparent text-transparent hover:border-emerald-500 hover:text-emerald-500/50",
        className,
      )}
    >
      <Check
        strokeWidth={3}
        className={cn(
          "size-3.5 transition-all duration-300 ease-out",
          concluida ? "scale-100 opacity-100" : "scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100",
        )}
      />
    </button>
  )
}
