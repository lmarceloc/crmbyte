"use client"

import { useEffect, useState } from "react"
import { Flame } from "lucide-react"

import { RequireRole } from "@/components/auth/require-role"
import { Badge } from "@/components/ui/badge"
import { useDetailPanel } from "@/components/detail/detail-panel-provider"

interface HotLead {
  enrollment_id: string
  cadence_name: string | null
  deal_id: string
  deal_title: string | null
  deal_status: string | null
  contact_name: string | null
  aberturas: number
  ultima_abertura_em: string | null
}

const STATUS: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" }

function fmt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function HotLeads() {
  const { open: abrirPainel } = useDetailPanel()
  const [leads, setLeads] = useState<HotLead[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/hot-leads")
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar.")
        setLeads(d.leads)
      })
      .catch((e: Error) => setErro(e.message))
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <Flame className="mt-1 h-6 w-6 text-orange-500" />
        <div>
          <h1 className="text-xl font-semibold">Leads quentes</h1>
          <p className="text-sm text-muted-foreground">
            Quem abriu o e-mail de uma cadência 3 vezes ou mais — sinal de interesse pra trabalhar agora.
          </p>
        </div>
      </div>

      {erro ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {erro}
        </div>
      ) : leads === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum lead quente ainda — assim que um lead inscrito numa cadência ativa abrir o e-mail 3 vezes, ele
          aparece aqui.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {leads.map((l) => (
            <li key={l.enrollment_id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => abrirPainel({ type: "deal", id: l.deal_id })}
                  className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                >
                  {l.deal_title ?? "Negócio sem título"}
                </button>
                <p className="truncate text-xs text-muted-foreground">
                  {l.contact_name ?? "Sem contato"} · {l.cadence_name ?? "Cadência"}
                </p>
                <p className="text-xs text-muted-foreground">Última abertura {fmt(l.ultima_abertura_em)}</p>
              </div>
              <Badge variant="outline">{STATUS[l.deal_status ?? ""] ?? "—"}</Badge>
              <Badge>{l.aberturas}× aberturas</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <RequireRole min="agent">
      <HotLeads />
    </RequireRole>
  )
}
