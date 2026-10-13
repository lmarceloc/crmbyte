"use client"

import { useEffect, useState } from "react"
import { Mail } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { passoParaExecutar } from "@/lib/cadencias/proximo-passo"
import type { Passo } from "@/lib/cadencias/tipos"

interface Numeros {
  disparados: number
  previstos: number
  entregues: number
}

/** E-mails das cadências hoje: enviados / previstos no dia, e entregues (enviados sem bounce). */
async function carregarDisparosDoDia(): Promise<Numeros> {
  const db = createClient()
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)

  const [enviados, bounces, pendentes, cadencias] = await Promise.all([
    db
      .from("email_cadence_events")
      .select("enrollment_id")
      .eq("tipo", "email_enviado")
      .gte("created_at", inicio.toISOString())
      .lt("created_at", fim.toISOString()),
    db
      .from("email_cadence_events")
      .select("enrollment_id")
      .eq("tipo", "bounce")
      .gte("created_at", inicio.toISOString()),
    // ainda vão rodar hoje (inclui atrasadas)
    db
      .from("email_cadence_enrollments")
      .select("cadence_id,passo_atual_id")
      .eq("status", "ativa")
      .lt("proximo_em", fim.toISOString()),
    db.from("email_cadences").select("id,passos").eq("status", "ativa"),
  ])

  const enviadosHoje = enviados.data ?? []
  const comBounce = new Set((bounces.data ?? []).map((b) => b.enrollment_id as string))
  const passosPorCadencia = new Map((cadencias.data ?? []).map((c) => [c.id as string, (c.passos ?? []) as Passo[]]))
  // só conta o que o próximo passo é e-mail (tarefa, espera, ramo não disparam e-mail)
  const aEnviar = (pendentes.data ?? []).filter((i) => {
    const passos = passosPorCadencia.get(i.cadence_id as string)
    return !!passos && passoParaExecutar(passos, i.passo_atual_id as string | null)?.tipo === "email"
  }).length

  return {
    disparados: enviadosHoje.length,
    previstos: enviadosHoje.length + aEnviar,
    entregues: enviadosHoje.filter((e) => !comBounce.has(e.enrollment_id as string)).length,
  }
}

export function DisparosDoDia() {
  const [n, setN] = useState<Numeros | null>(null)

  useEffect(() => {
    let vivo = true
    const carregar = () =>
      carregarDisparosDoDia()
        .then((r) => vivo && setN(r))
        .catch((err) => console.error("[dashboard] disparos do dia failed:", err))
    void carregar()
    const t = setInterval(carregar, 60_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  const hoje = new Date().toLocaleDateString("pt-BR")

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-baseline gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-foreground">Disparos do dia</p>
          <span className="text-sm tabular-nums text-muted-foreground">{hoje}</span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-center">
        <Contador titulo="Envios disparados" valor={n?.disparados} total={n?.previstos} />
        <Contador titulo="Entregues" valor={n?.entregues} total={n?.disparados} />
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        E-mails das cadências previstos para hoje: enviados até agora / total do dia. Entregues = enviados sem
        devolução (bounce).
      </p>
    </div>
  )
}

function Contador({ titulo, valor, total }: { titulo: string; valor?: number; total?: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-3 tabular-nums text-foreground">
        {valor === undefined ? (
          <span className="inline-block h-9 w-20 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <span className="text-4xl font-bold">{valor}</span>
            <span className="text-lg text-muted-foreground">/{total}</span>
          </>
        )}
      </p>
    </div>
  )
}
