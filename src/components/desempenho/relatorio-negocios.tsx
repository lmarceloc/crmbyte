"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Download, FileText, Loader2, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { formatMoeda } from "@/lib/money"
import {
  agruparPorEmpresa,
  csvEscape,
  motivosDePerda,
  totais,
  type NegocioLinha,
  type ResumoEmpresa,
} from "@/lib/relatorios/negocios"

type SecaoId = "resumo" | "empresas" | "motivos" | "detalhe"
const SECOES: { id: SecaoId; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo geral" },
  { id: "empresas", rotulo: "Por empresa" },
  { id: "motivos", rotulo: "Motivos de perda" },
  { id: "detalhe", rotulo: "Lista de negócios" },
]

type ColunaId = "total" | "abertos" | "ganhos" | "perdidos" | "vendido" | "ticket" | "perdido" | "aberto" | "conversao"
const COLUNAS: { id: ColunaId; rotulo: string }[] = [
  { id: "total", rotulo: "Negócios" },
  { id: "abertos", rotulo: "Em aberto (qtd)" },
  { id: "ganhos", rotulo: "Ganhos" },
  { id: "perdidos", rotulo: "Perdidos" },
  { id: "vendido", rotulo: "Total vendido" },
  { id: "ticket", rotulo: "Ticket médio" },
  { id: "perdido", rotulo: "Total perdido" },
  { id: "aberto", rotulo: "Em aberto (valor)" },
  { id: "conversao", rotulo: "Conversão" },
]

const STATUS_ROTULO = { open: "Aberto", won: "Ganho", lost: "Perdido" } as const
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`)
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—")

interface LinhaBruta {
  id: string
  title: string
  value: number | null
  status: "open" | "won" | "lost" | null
  created_at: string
  closed_at: string | null
  lost_reason: string | null
  lost_note: string | null
  company_id: string | null
  assigned_to: string | null
  companies: { name: string } | { name: string }[] | null
}

export function RelatorioNegocios() {
  const { defaultCurrency } = useAuth()
  const moeda = (v: number) => formatMoeda(v, defaultCurrency)

  const [linhas, setLinhas] = useState<(NegocioLinha & { assigned_to: string | null })[]>([])
  const [pessoas, setPessoas] = useState<{ user_id: string; full_name: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")
  const [dono, setDono] = useState("")
  const [busca, setBusca] = useState("")
  const [secoes, setSecoes] = useState<Set<SecaoId>>(new Set(["resumo", "empresas", "motivos"]))
  const [colunas, setColunas] = useState<Set<ColunaId>>(
    new Set(["total", "abertos", "aberto", "ganhos", "perdidos", "vendido", "ticket", "perdido"]),
  )
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  useEffect(() => {
    const t = setTimeout(async () => {
      const supabase = createClient()
      const todas: LinhaBruta[] = []
      for (let from = 0; from < 20000; from += 1000) {
        const { data: lote, error } = await supabase
          .from("deals")
          .select("id,title,value,status,created_at,closed_at,lost_reason,lost_note,company_id,assigned_to,companies(name)")
          .order("created_at", { ascending: false })
          .range(from, from + 999)
        if (error) {
          setErro(error.message)
          setCarregando(false)
          return
        }
        todas.push(...((lote ?? []) as unknown as LinhaBruta[]))
        if (!lote || lote.length < 1000) break
      }
      const { data: p } = await supabase.from("profiles").select("user_id,full_name").order("full_name")
      setPessoas((p ?? []) as { user_id: string; full_name: string }[])
      setLinhas(
        todas.map((d) => {
          const c = Array.isArray(d.companies) ? d.companies[0] : d.companies
          return {
            id: d.id,
            title: d.title,
            value: Number(d.value) || 0,
            status: d.status ?? "open",
            created_at: d.created_at,
            closed_at: d.closed_at,
            lost_reason: d.lost_reason,
            lost_note: d.lost_note,
            company_id: d.company_id,
            company_name: c?.name ?? null,
            assigned_to: d.assigned_to,
          }
        }),
      )
      setErro(null)
      setCarregando(false)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const filtradas = useMemo(() => {
    const ini = de ? new Date(`${de}T00:00:00`).getTime() : null
    const fim = ate ? new Date(`${ate}T23:59:59.999`).getTime() : null
    return linhas.filter((n) => {
      const t = new Date(n.created_at).getTime()
      if (ini != null && t < ini) return false
      if (fim != null && t > fim) return false
      if (dono && n.assigned_to !== dono) return false
      return true
    })
  }, [linhas, de, ate, dono])

  const empresas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return agruparPorEmpresa(filtradas).filter((e) => !b || e.empresa.toLowerCase().includes(b))
  }, [filtradas, busca])
  const visiveis = useMemo(() => empresas.flatMap((e) => e.negocios), [empresas])
  const tot = useMemo(() => totais(empresas), [empresas])
  const motivos = useMemo(() => motivosDePerda(visiveis), [visiveis])

  const alternar = <T,>(set: Set<T>, v: T, aplicar: (s: Set<T>) => void) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    aplicar(n)
  }

  const valorColuna = (e: ResumoEmpresa, c: ColunaId): string => {
    switch (c) {
      case "total": return String(e.total)
      case "abertos": return String(e.abertos)
      case "ganhos": return String(e.ganhos)
      case "perdidos": return String(e.perdidos)
      case "vendido": return moeda(e.vendido)
      case "ticket": return e.ganhos ? moeda(e.ticketMedio) : "—"
      case "perdido": return moeda(e.perdido)
      case "aberto": return moeda(e.valorAberto)
      case "conversao": return pct(e.conversao)
    }
  }
  const colsAtivas = COLUNAS.filter((c) => colunas.has(c.id))

  function exportarCsv() {
    const cab = ["Empresa", ...colsAtivas.map((c) => c.rotulo)]
    const rows = empresas.map((e) => [e.empresa, ...colsAtivas.map((c) => valorColuna(e, c.id))])
    const csv = [cab, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `relatorio-empresas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sel = "h-8 rounded-md border bg-background px-2 text-sm"
  const chip = (ativo: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-xs ${ativo ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`

  if (carregando) return <div className="flex justify-center p-10"><Loader2 className="size-5 animate-spin" /></div>

  return (
    <div className="space-y-5">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #relatorio-impressao, #relatorio-impressao * { visibility: visible !important; }
        #relatorio-impressao { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; background: white; color: black; }
        .nao-imprimir { display: none !important; }
      }`}</style>

      {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{erro}</div>}

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            Empresa
            <Input className="h-8 w-48" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Responsável
            <select className={`${sel} block`} value={dono} onChange={(e) => setDono(e.target.value)}>
              <option value="">Todos</option>
              {pessoas.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Criado de
            <Input type="date" className="h-8 w-40" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            até
            <Input type="date" className="h-8 w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={exportarCsv}><Download className="mr-1 size-4" />CSV</Button>
            <Button size="sm" onClick={() => window.print()}><Printer className="mr-1 size-4" />Exportar PDF</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Mostrar no relatório:</span>
          {SECOES.map((s) => (
            <label key={s.id} className={chip(secoes.has(s.id))}>
              <input type="checkbox" className="sr-only" checked={secoes.has(s.id)} onChange={() => alternar(secoes, s.id, setSecoes)} />
              {s.rotulo}
            </label>
          ))}
        </div>
        {secoes.has("empresas") && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Colunas:</span>
            {COLUNAS.map((c) => (
              <label key={c.id} className={chip(colunas.has(c.id))}>
                <input type="checkbox" className="sr-only" checked={colunas.has(c.id)} onChange={() => alternar(colunas, c.id, setColunas)} />
                {c.rotulo}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          “Exportar PDF” abre a impressão do navegador: escolha “Salvar como PDF”. Sai só o que está marcado acima.
        </p>
      </div>

      <div id="relatorio-impressao" className="space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><FileText className="size-5" />Relatório de negócios por empresa</h2>
          <p className="text-xs text-muted-foreground">
            Gerado em {new Date().toLocaleString("pt-BR")}
            {(de || ate) && ` · negócios criados ${de ? `de ${data(de + "T00:00:00")}` : ""} ${ate ? `até ${data(ate + "T00:00:00")}` : ""}`}
          </p>
        </div>

        {secoes.has("resumo") && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Empresas", String(tot.empresas)],
              ["Negócios", `${tot.total} (${tot.abertos} em aberto)`],
              ["Total vendido", moeda(tot.vendido)],
              ["Ticket médio", tot.ganhos ? moeda(tot.ticketMedio) : "—"],
              ["Valor em aberto", moeda(tot.valorAberto)],
              ["Ganhos", String(tot.ganhos)],
              ["Perdidos", String(tot.perdidos)],
              ["Total perdido", moeda(tot.perdido)],
              ["Conversão", pct(tot.conversao)],
            ].map(([t, v]) => (
              <div key={t} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t}</p>
                <p className="mt-1 text-lg font-semibold">{v}</p>
              </div>
            ))}
          </section>
        )}

        {secoes.has("empresas") && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Por empresa</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Empresa</th>
                    {colsAtivas.map((c) => <th key={c.id} className="p-2 text-right">{c.rotulo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {empresas.length === 0 && <tr><td colSpan={colsAtivas.length + 1} className="p-4 text-center text-muted-foreground">Sem dados.</td></tr>}
                  {empresas.map((e) => {
                    const aberta = abertas.has(e.chave)
                    return (
                      <Fragment key={e.chave}>
                        <tr className="border-b last:border-0">
                          <td className="p-2">
                            <button type="button" className="nao-imprimir-btn inline-flex items-center gap-1 text-left font-medium" onClick={() => alternar(abertas, e.chave, setAbertas)}>
                              {aberta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                              {e.empresa}
                            </button>
                          </td>
                          {colsAtivas.map((c) => <td key={c.id} className="p-2 text-right tabular-nums">{valorColuna(e, c.id)}</td>)}
                        </tr>
                        {aberta && e.negocios.map((n) => (
                          <tr key={n.id} className="border-b bg-muted/30 text-xs last:border-0">
                            <td className="p-2 pl-8" colSpan={colsAtivas.length + 1}>
                              {n.title} · {STATUS_ROTULO[n.status]} · {moeda(n.value)}
                              {n.status === "lost" && ` · ${n.lost_reason ?? "sem motivo"}${n.lost_note ? ` (${n.lost_note})` : ""}`}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {secoes.has("motivos") && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Motivos de perda</h3>
            {motivos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum negócio perdido neste filtro.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr><th className="p-2">Motivo</th><th className="p-2 text-right">Negócios</th><th className="p-2 text-right">% das perdas</th><th className="p-2 text-right">Valor perdido</th></tr>
                  </thead>
                  <tbody>
                    {motivos.map((m) => (
                      <tr key={m.motivo} className="border-b last:border-0">
                        <td className="p-2">{m.motivo}</td>
                        <td className="p-2 text-right">{m.quantidade}</td>
                        <td className="p-2 text-right">{pct(tot.perdidos ? m.quantidade / tot.perdidos : null)}</td>
                        <td className="p-2 text-right tabular-nums">{moeda(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {secoes.has("detalhe") && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Lista de negócios ({visiveis.length})</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr><th className="p-2">Empresa</th><th className="p-2">Negócio</th><th className="p-2">Status</th><th className="p-2 text-right">Valor</th><th className="p-2">Criado</th><th className="p-2">Fechado</th><th className="p-2">Motivo da perda</th></tr>
                </thead>
                <tbody>
                  {visiveis.map((n) => (
                    <tr key={n.id} className="border-b last:border-0">
                      <td className="p-2">{n.company_name ?? "—"}</td>
                      <td className="p-2">{n.title}</td>
                      <td className="p-2">{STATUS_ROTULO[n.status]}</td>
                      <td className="p-2 text-right tabular-nums">{moeda(n.value)}</td>
                      <td className="p-2">{data(n.created_at)}</td>
                      <td className="p-2">{data(n.closed_at)}</td>
                      <td className="p-2">{n.status === "lost" ? `${n.lost_reason ?? "—"}${n.lost_note ? ` (${n.lost_note})` : ""}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
