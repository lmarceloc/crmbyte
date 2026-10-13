"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"

/** Resumo semanal por e-mail (segunda 8h, para donos/admins) + botão de prévia. */
export function ResumoSemanalCard() {
  const pode = useCan("manage-members")
  const [enviando, setEnviando] = useState(false)

  async function previa() {
    setEnviando(true)
    const res = await fetch("/api/resumo-semanal/previa", { method: "POST" })
    const body = await res.json().catch(() => ({}))
    setEnviando(false)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao enviar a prévia.")
    toast.success(`Prévia enviada para ${body.enviadoPara}`)
  }

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="size-4" />
        </div>
        <div>
          <p className="font-medium">Resumo semanal por e-mail</p>
          <p className="text-sm text-muted-foreground">
            Toda segunda, às 8h, donos e administradores recebem o resumo da semana anterior: negócios, tarefas,
            cadências, temperatura dos leads e negócios por dono.
          </p>
        </div>
      </div>
      {pode && (
        <Button size="sm" variant="outline" disabled={enviando} onClick={previa} className="shrink-0">
          {enviando && <Loader2 className="size-3.5 animate-spin" />} Enviar prévia para mim
        </Button>
      )}
    </div>
  )
}
