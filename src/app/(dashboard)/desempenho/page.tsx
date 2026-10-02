"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, Loader2 } from "lucide-react"

import { RequireRole } from "@/components/auth/require-role"
import { Funil } from "@/components/cadencias/funil"
import { RelatorioNegocios } from "@/components/desempenho/relatorio-negocios"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

interface LinhaCadencia {
  id: string
  name: string
  inscritos: number
  enviados: number
  abertos: number
  clicados: number
  com_interesse: number
  sem_interesse: number
  agendado: number
}
interface Desempenho {
  inscritos: number
  enviados: number
  abertos: number
  clicados: number
  com_interesse: number
  sem_interesse: number
  agendado: number
  emails_enviados_total: number
  aberturas_total: number
  cliques_total: number
  descadastros: number
  falhas: number
  por_cadencia: LinhaCadencia[]
}

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—")

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: number | string; detalhe?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

function Pagina() {
  const [aba, setAba] = useState<"cadencias" | "negocios">("cadencias")
  const [cadencias, setCadencias] = useState<{ id: string; name: string }[]>([])
  const [pessoas, setPessoas] = useState<{ user_id: string; full_name: string }[]>([])
  const [cadenciaId, setCadenciaId] = useState("")
  const [por, setPor] = useState("")
  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")
  const [dados, setDados] = useState<Desempenho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const t = setTimeout(async () => {
      const [c, p] = await Promise.all([
        fetch("/api/cadencias").then((r) => r.json()).catch(() => ({})),
        createClient().from("profiles").select("user_id,full_name").order("full_name"),
      ])
      setCadencias(c.cadencias ?? [])
      setPessoas((p.data ?? []) as { user_id: string; full_name: string }[])
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      setCarregando(true)
      const qs = new URLSearchParams()
      if (cadenciaId) qs.set("cadence_id", cadenciaId)
      if (por) qs.set("por", por)
      if (de) qs.set("de", de)
      if (ate) qs.set("ate", ate)
      const res = await fetch(`/api/cadencias/desempenho?${qs}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(body?.error ?? "Falha ao carregar as métricas.")
        setDados(null)
      } else {
        setErro(null)
        setDados(body.desempenho)
      }
      setCarregando(false)
    }, 0)
    return () => clearTimeout(t)
  }, [cadenciaId, por, de, ate])

  const etapas = useMemo(
    () =>
      dados
        ? [
            { rotulo: "Inscritos", valor: dados.inscritos, cor: "#f4a08a" },
            { rotulo: "E-mails enviados", valor: dados.enviados, cor: "#4fd1c5" },
            { rotulo: "Abertos", valor: dados.abertos, cor: "#b79cf0" },
            { rotulo: "Clicados", valor: dados.clicados, cor: "#f2b872" },
          ]
        : [],
    [dados],
  )
  const resultados = useMemo(
    () =>
      dados
        ? [
            { rotulo: "Agendado", valor: dados.agendado, cor: "#34a853" },
            { rotulo: "Com interesse", valor: dados.com_interesse, cor: "#e86fa5" },
            { rotulo: "Sem interesse", valor: dados.sem_interesse, cor: "#8b8fa3" },
          ]
        : [],
    [dados],
  )

  const sel = "h-8 rounded-md border bg-background px-2 text-sm"

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <BarChart3 className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Desempenho</h1>
          <p className="text-sm text-muted-foreground">Cadências de e-mail e resultado dos negócios por empresa.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {([["cadencias", "Cadências"], ["negocios", "Negócios por empresa"]] as const).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "negocios" && <RelatorioNegocios />}
      {aba === "cadencias" && (<>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Cadência
          <select className={`${sel} block`} value={cadenciaId} onChange={(e) => setCadenciaId(e.target.value)}>
            <option value="">Todas</option>
            {cadencias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Inscrito por
          <select className={`${sel} block`} value={por} onChange={(e) => setPor(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => (
              <option key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Inscrição de
          <Input type="date" className="h-8 w-40" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          até
          <Input type="date" className="h-8 w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{erro}</div>
      )}

      {carregando && !dados && (
        <div className="flex justify-center p-10"><Loader2 className="size-5 animate-spin" /></div>
      )}

      {dados && (
        <>
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-medium">Resultados</h2>
            {dados.inscritos === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhum lead inscrito neste filtro ainda. Inscreva negócios numa cadência ativa para ver o fluxo.
              </p>
            ) : (
              <Funil etapas={etapas} resultados={resultados} />
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cartao titulo="E-mails enviados" valor={dados.emails_enviados_total} detalhe={`${dados.enviados} leads receberam`} />
            <Cartao
              titulo="Taxa de abertura"
              valor={pct(dados.abertos, dados.enviados)}
              detalhe={`${dados.abertos} leads · ${dados.aberturas_total} aberturas`}
            />
            <Cartao
              titulo="Taxa de clique"
              valor={pct(dados.clicados, dados.enviados)}
              detalhe={`${dados.clicados} leads · ${dados.cliques_total} cliques`}
            />
            <Cartao
              titulo="Agendados"
              valor={dados.agendado}
              detalhe={`${pct(dados.agendado, dados.inscritos)} dos inscritos`}
            />
            <Cartao titulo="Com interesse" valor={dados.com_interesse} detalhe={pct(dados.com_interesse, dados.inscritos)} />
            <Cartao titulo="Sem interesse" valor={dados.sem_interesse} detalhe={pct(dados.sem_interesse, dados.inscritos)} />
            <Cartao titulo="Descadastros" valor={dados.descadastros} detalhe={pct(dados.descadastros, dados.enviados)} />
            <Cartao titulo="Falhas de envio" valor={dados.falhas} />
          </section>

          <section className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Cadência</th>
                  <th className="p-2 text-right">Inscritos</th>
                  <th className="p-2 text-right">Enviados</th>
                  <th className="p-2 text-right">Abertos</th>
                  <th className="p-2 text-right">Clicados</th>
                  <th className="p-2 text-right">Agendado</th>
                  <th className="p-2 text-right">Interesse</th>
                  <th className="p-2 text-right">Sem interesse</th>
                </tr>
              </thead>
              <tbody>
                {dados.por_cadencia.length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Sem dados.</td></tr>
                )}
                {dados.por_cadencia.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-2">{c.name}</td>
                    <td className="p-2 text-right">{c.inscritos}</td>
                    <td className="p-2 text-right">{c.enviados}</td>
                    <td className="p-2 text-right">{c.abertos} <span className="text-xs text-muted-foreground">({pct(c.abertos, c.enviados)})</span></td>
                    <td className="p-2 text-right">{c.clicados} <span className="text-xs text-muted-foreground">({pct(c.clicados, c.enviados)})</span></td>
                    <td className="p-2 text-right">{c.agendado}</td>
                    <td className="p-2 text-right">{c.com_interesse}</td>
                    <td className="p-2 text-right">{c.sem_interesse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-xs text-muted-foreground">
            O funil conta cada lead uma vez por etapa. Aberturas e cliques podem ser inflados por leitores de e-mail e antivírus que
            pré-carregam imagens e links. O resultado (agendado, com/sem interesse) é marcado por você na aba “Inscritos” de cada cadência
            e não depende de o lead ter aberto ou clicado.
          </p>
        </>
      )}
      </>)}
    </div>
  )
}

export default function DesempenhoPage() {
  return (
    <RequireRole min="agent">
      <Pagina />
    </RequireRole>
  )
}
