"use client"

import { TelefoneWhatsapp } from "@/components/whatsapp-phone-link"
import { linkWhatsapp } from "@/lib/whatsapp-link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Kind = "simples" | "b2b"

interface Campaign {
  id: string
  name: string
  search_status: "starting" | "running" | "succeeded" | "failed" | "unknown"
  cost_usd: number | null
  result_count: number
  skipped_count: number
  error: string | null
}
interface Candidate {
  id: string
  campaign_id: string
  phone: string | null
  status: "new" | "queued" | "sending" | "sent" | "skipped" | "failed" | "enriched"
  contact_id: string | null
  deal_id: string | null
  error: string | null
  data: Record<string, unknown>
}
interface Stage {
  id: string
  name: string
  pipeline_id: string
  pipeline_name: string
}
interface Listing {
  configured: boolean
  campaigns: Campaign[]
  candidates: Candidate[]
  pipelines: { id: string; name: string }[]
  stages: Stage[]
}
interface ImportResult {
  imported: number
  already: number
  skipped: { id: string; reason: string }[]
}

const STATUS_BUSCA: Record<string, string> = {
  starting: "Iniciando",
  running: "Em andamento",
  succeeded: "Busca concluída",
  failed: "Revisar falha",
  unknown: "Conferir no provedor",
}
const STATUS_CAND: Record<string, string> = {
  new: "Revelando e-mail",
  enriched: "E-mail verificado",
  skipped: "Sem e-mail verificado",
  failed: "Falhou",
}

function safeLink(url: unknown): string | null {
  if (typeof url !== "string") return null
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

export function ProspectingPanel({ kind }: { kind: Kind }) {
  const base = kind === "b2b" ? "/api/prospecting/b2b" : "/api/prospecting"
  const [data, setData] = useState<Listing | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const temDados = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(base)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Falha ao carregar.")
      temDados.current = true
      setData(d)
      setErro(null)
    } catch (e) {
      // falha numa atualização automática não deve piscar um banner de erro
      // por cima de dados que já estão na tela
      if (!temDados.current) setErro((e as Error).message)
    }
  }, [base])

  useEffect(() => {
     
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [load])

  const campaign = data?.campaigns.find((c) => c.id === selected) ?? null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">{kind === "b2b" ? "Prospecção B2B" : "Prospecção simples"}</h1>
        <p className="text-sm text-muted-foreground">
          {kind === "b2b"
            ? "Encontre pessoas por cargo e/ou domínio da empresa. Só entram leads com e-mail comercial verificado."
            : "Encontre empresas por nicho e região (Google Maps), com telefone, site e e-mails."}
        </p>
      </div>

      {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}
      {!data && !erro && <div className="h-24 animate-pulse rounded-lg bg-muted" />}

      {data && (
        <>
          {kind === "b2b" && !data.configured && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              A Prospecção B2B não está configurada nesta instalação. Peça para quem administra definir TREG_API_KEY.
            </div>
          )}
          {kind === "simples" && !data.configured && <ApifyKeyForm onSaved={load} />}

          <SearchForm kind={kind} disabled={!data.configured} onCreated={(c) => { setSelected(c.id); load() }} />

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Suas buscas</h2>
            {data.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma busca ainda.</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {data.campaigns.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      className={`flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted/50 ${selected === c.id ? "bg-muted/50" : ""}`}
                    >
                      <span className="flex-1 truncate font-medium">{c.name}</span>
                      <Badge variant={c.search_status === "failed" ? "destructive" : "outline"}>
                        {STATUS_BUSCA[c.search_status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{c.result_count} leads</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {campaign && (
            <CampaignDetail
              kind={kind}
              campaign={campaign}
              candidates={data.candidates.filter((c) => c.campaign_id === campaign.id)}
              stages={data.stages}
              pipelines={data.pipelines}
              onImported={load}
            />
          )}
        </>
      )}
    </div>
  )
}

function ApifyKeyForm({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const r = await fetch("/api/prospecting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "configure", api_key: key }),
    })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) return toast.error(d.error ?? "Falha ao salvar a chave.")
    setKey("")
    toast.success("Chave salva.")
    onSaved()
  }
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Label htmlFor="apify-key">Chave de busca (Apify)</Label>
      <p className="text-xs text-muted-foreground">Validada antes de salvar e guardada cifrada. Nunca é exibida de novo.</p>
      <div className="flex gap-2">
        <Input id="apify-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        <Button onClick={save} disabled={busy || key.trim().length < 10}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
        </Button>
      </div>
    </div>
  )
}

function SearchForm({
  kind,
  disabled,
  onCreated,
}: {
  kind: Kind
  disabled: boolean
  onCreated: (c: Campaign) => void
}) {
  const [f, setF] = useState({
    name: "",
    title: "",
    company_domain: "",
    niche: "",
    location: "",
    limit: 20,
    budget_usd: 1,
    enrich: true,
    legal_basis_ref: "",
  })
  const [busy, setBusy] = useState(false)
  // request_id idempotente: só troca quando o formulário muda.
  const rid = useRef<{ fp: string; id: string } | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const fp = JSON.stringify(f)
    if (!rid.current || rid.current.fp !== fp) rid.current = { fp, id: crypto.randomUUID() }
    const search =
      kind === "b2b"
        ? {
            name: f.name,
            ...(f.title.trim() ? { title: f.title } : {}),
            ...(f.company_domain.trim() ? { company_domain: f.company_domain } : {}),
            limit: f.limit,
            budget_usd: f.budget_usd,
            legal_basis_ref: f.legal_basis_ref,
          }
        : { name: f.name, niche: f.niche, location: f.location, limit: f.limit, budget_usd: f.budget_usd, enrich: f.enrich }
    setBusy(true)
    try {
      const r = await fetch(kind === "b2b" ? "/api/prospecting/b2b" : "/api/prospecting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", request_id: rid.current.id, search }),
      })
      const d = await r.json()
      if (!r.ok) return toast.error(d.error ?? "Falha na busca.")
      // B2B devolve 200 com a campanha em `failed`: olhe search_status.
      if (d.campaign.search_status === "failed") toast.error(d.campaign.error ?? "A busca falhou.")
      else if (d.campaign.search_status === "unknown") toast.warning(d.campaign.error ?? "Busca sem confirmação.")
      else toast.success("Busca criada.")
      onCreated(d.campaign)
    } finally {
      setBusy(false)
    }
  }

  const num = (k: "limit" | "budget_usd", min: number, max: number, step = 1) => (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={f[k]}
      onChange={(e) => set(k, Number(e.target.value))}
    />
  )

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <h2 className="text-sm font-semibold sm:col-span-2">Encontrar {kind === "b2b" ? "leads" : "empresas"}</h2>
      <Field label="Nome da busca"><Input required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      {kind === "b2b" ? (
        <>
          <Field label="Cargo-alvo"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Diretor de logística" /></Field>
          <Field label="Domínio da empresa"><Input value={f.company_domain} onChange={(e) => set("company_domain", e.target.value)} placeholder="empresa.com.br" /></Field>
        </>
      ) : (
        <>
          <Field label="Nicho"><Input required value={f.niche} onChange={(e) => set("niche", e.target.value)} placeholder="Transportadoras" /></Field>
          <Field label="Região"><Input required value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Curitiba, PR" /></Field>
        </>
      )}
      <Field label="Até quantos leads (1–100)">{num("limit", 1, 100)}</Field>
      <Field label="Teto da busca (US$ 0,5–10)">{num("budget_usd", 0.5, 10, 0.5)}</Field>
      {kind === "b2b" ? (
        <div className="sm:col-span-2">
          <Field label="Referência do legítimo interesse (LGPD)">
            <Input required minLength={3} value={f.legal_basis_ref} onChange={(e) => set("legal_basis_ref", e.target.value)} placeholder="Ex.: LIA-2026-04 — prospecção B2B de transportadoras" />
          </Field>
          <p className="mt-1 text-xs text-muted-foreground">
            Só entram leads com e-mail verificado; a quantidade final pode ser menor que o limite. Pelo menos cargo ou domínio é obrigatório.
          </p>
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.enrich} onChange={(e) => set("enrich", e.target.checked)} />
          Enriquecer com e-mails e redes do site da empresa
        </label>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={disabled || busy}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Buscar
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function CampaignDetail({
  kind,
  campaign,
  candidates,
  stages,
  pipelines,
  onImported,
}: {
  kind: Kind
  campaign: Campaign
  candidates: Candidate[]
  stages: Stage[]
  pipelines: { id: string; name: string }[]
  onImported: () => void
}) {
  const [importIds, setImportIds] = useState<string[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const pendentes = candidates
    .filter((c) => !c.deal_id && (kind === "simples" ? !!c.phone : !!c.contact_id))
    .map((c) => c.id)
  // seleção efetiva: ignora quem já foi importado desde que foi marcado
  const selecionados = pendentes.filter((id) => marcados.has(id))
  const todosMarcados = pendentes.length > 0 && selecionados.length === pendentes.length
  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  const verified = candidates.filter((c) => c.status === "enriched").length
  const revealing = candidates.filter((c) => c.status === "new").length

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{campaign.name}</h2>
        <Badge variant={campaign.search_status === "failed" ? "destructive" : "outline"}>{STATUS_BUSCA[campaign.search_status]}</Badge>
        {campaign.cost_usd !== null && <span className="text-xs text-muted-foreground">Custo: US$ {Number(campaign.cost_usd).toFixed(2)}</span>}
      </div>
      {campaign.error && <p className="text-sm text-destructive">{campaign.error}</p>}
      {kind === "b2b" ? (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat n={campaign.result_count} l="Encontrados" />
          <Stat n={verified} l="E-mail verificado" />
          <Stat n={revealing} l="Revelando" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {campaign.result_count} empresas · {campaign.skipped_count} repetidas ou indisponíveis
        </p>
      )}

      {candidates.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selecionados.length > 0 && (
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setMarcados(new Set())}>
                Limpar seleção
              </button>
            )}
            <Button size="sm" disabled={selecionados.length === 0} onClick={() => setImportIds(selecionados)}>
              Importar selecionados ({selecionados.length})
            </Button>
            <Button size="sm" variant="outline" disabled={pendentes.length === 0} onClick={() => setImportIds(pendentes)}>
              Importar todos ({pendentes.length})
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 p-2">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      disabled={pendentes.length === 0}
                      checked={todosMarcados}
                      onChange={() => setMarcados(todosMarcados ? new Set() : new Set(pendentes))}
                    />
                  </th>
                  <th className="p-2">{kind === "b2b" ? "Lead" : "Empresa"}</th>
                  <th className="p-2">Contato</th>
                  <th className="p-2">Situação</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((c) => (
                  <Row
                    key={c.id}
                    kind={kind}
                    c={c}
                    marcado={marcados.has(c.id)}
                    onToggle={() => alternar(c.id)}
                    onImport={() => setImportIds([c.id])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {importIds && (
        <ImportPanel
          // remonta a cada nova abertura: sem isso o resultado da importação
          // anterior ficava na tela e o botão parecia "morto"
          key={importIds.join(",")}
          kind={kind}
          ids={importIds}
          stages={stages}
          pipelines={pipelines}
          onClose={() => setImportIds(null)}
          onDone={onImported}
        />
      )}
    </section>
  )
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <div className="text-lg font-semibold">{n}</div>
      <div className="text-muted-foreground">{l}</div>
    </div>
  )
}

function Row({
  kind,
  c,
  marcado,
  onToggle,
  onImport,
}: {
  kind: Kind
  c: Candidate
  marcado: boolean
  onToggle: () => void
  onImport: () => void
}) {
  const d = c.data
  const link = safeLink(kind === "b2b" ? d.linkedin : d.maps_url)
  const site = kind === "simples" ? safeLink(d.website) : null
  const emails = Array.isArray(d.emails) ? (d.emails as string[]) : []
  const canImport = !c.deal_id && (kind === "simples" ? !!c.phone : !!c.contact_id)
  return (
    <tr className={marcado ? "bg-primary/5" : undefined}>
      <td className="p-2">
        {canImport && (
          <input type="checkbox" aria-label="Selecionar para importar" checked={marcado} onChange={onToggle} />
        )}
      </td>
      <td className="p-2">
        <div className="font-medium">{str(kind === "b2b" ? d.fullName : d.name)}</div>
        <div className="text-xs text-muted-foreground">
          {kind === "b2b" ? [str(d.title), str(d.companyName)].filter(Boolean).join(" · ") : str(d.category)}
        </div>
      </td>
      <td className="p-2 text-xs">
        {kind === "b2b" ? (
          <>
            {str(d.location)}
            {str(d.email) && <div>{str(d.email)} {d.emailVerified === true && <Badge variant="outline">verificado</Badge>}</div>}
          </>
        ) : (
          <>
            {c.phone && <div><TelefoneWhatsapp phone={c.phone} /></div>}
            {emails[0] && <div>{emails[0]}</div>}
            {site && <a className="text-primary hover:underline" href={site} target="_blank" rel="noopener noreferrer">site</a>}
          </>
        )}
        {link && (
          <a className="ml-2 inline-flex items-center gap-0.5 text-primary hover:underline" href={link} target="_blank" rel="noopener noreferrer">
            {kind === "b2b" ? "LinkedIn" : "Mapa"}<ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
      <td className="p-2 text-xs">
        {c.deal_id ? "No funil" : kind === "b2b" ? STATUS_CAND[c.status] ?? c.status : "Novo"}
        {c.error && <div className="text-muted-foreground">{c.error}</div>}
      </td>
      <td className="space-x-1 p-2 text-right">
        {kind === "simples" && linkWhatsapp(c.phone) && (
          <a
            className="text-xs text-primary hover:underline"
            href={linkWhatsapp(c.phone) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no WhatsApp
          </a>
        )}
        {canImport && (
          <Button size="sm" variant="outline" onClick={onImport}>
            Importar
          </Button>
        )}
      </td>
    </tr>
  )
}

function ImportPanel({
  kind,
  ids,
  stages,
  pipelines,
  onClose,
  onDone,
}: {
  kind: Kind
  ids: string[]
  stages: Stage[]
  pipelines: { id: string; name: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const alvo = ids
  const storeKey = `prospecting-import-${kind}`
  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [ref, setRef] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storeKey) ?? "null")
       
      if (s?.pipelineId) { setPipelineId(s.pipelineId); setStageId(s.stageId ?? "") }
    } catch {}
  }, [storeKey])

  const opts = stages.filter((s) => s.pipeline_id === pipelineId)

  async function run() {
    setBusy(true)
    try {
      // a API aceita até 100 por chamada: importa em lotes e soma o resultado
      const total: ImportResult = { imported: 0, already: 0, skipped: [] }
      for (let i = 0; i < alvo.length; i += 100) {
        const r = await fetch("/api/prospecting/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            candidate_ids: alvo.slice(i, i + 100),
            pipeline_id: pipelineId,
            stage_id: stageId,
            ...(kind === "simples" ? { legal_basis_ref: ref } : {}),
          }),
        })
        const d = await r.json()
        if (!r.ok) {
          toast.error(d.error ?? "Falha ao importar.")
          if (i === 0) return
          break
        }
        total.imported += d.imported
        total.already += d.already
        total.skipped.push(...d.skipped)
      }
      try { localStorage.setItem(storeKey, JSON.stringify({ pipelineId, stageId })) } catch {}
      setResult(total)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">Importar {alvo.length} para o funil</h3>
      {result ? (
        <div className="space-y-1 text-sm">
          <p>Importados: {result.imported} · Já estavam: {result.already} · Pulados: {result.skipped.length}</p>
          {result.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {result.skipped.slice(0, 20).map((s) => <li key={s.id}>{s.reason}</li>)}
            </ul>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Funil">
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId("") }}>
                <option value="">Escolha…</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Etapa de entrada">
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={stageId} onChange={(e) => setStageId(e.target.value)} disabled={!pipelineId}>
                <option value="">Escolha…</option>
                {opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          {kind === "simples" && (
            <Field label="Referência do legítimo interesse (LGPD)">
              <Input value={ref} onChange={(e) => setRef(e.target.value)} />
            </Field>
          )}
          <p className="text-xs text-muted-foreground">Nenhuma abordagem é disparada: o resultado vira Contato + Negócio.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={run} disabled={busy || alvo.length === 0 || !pipelineId || !stageId || (kind === "simples" && ref.trim().length < 3)}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Importar{alvo.length > 1 ? ` (${alvo.length})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </>
      )}
    </div>
  )
}
