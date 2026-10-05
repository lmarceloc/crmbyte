"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { KeyRound, Loader2, Trash2 } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingsPanelHead } from "./settings-panel-head"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"

interface StatusChave {
  provider: "apify" | "treg" | "openrouter"
  configurada: boolean
  origem: "conta" | "instalacao" | null
  hint: string | null
  updated_at: string | null
}

const SERVICOS: Record<StatusChave["provider"], { nome: string; para: string; onde: string }> = {
  apify: {
    nome: "Apify",
    para: "Busca simples de empresas (ex.: Google Maps) na tela Prospecção.",
    onde: "Apify Console → Settings → API & Integrations → API token.",
  },
  treg: {
    nome: "Treg",
    para: "Prospecção B2B: busca de pessoas por cargo/empresa e descoberta e verificação de e-mails.",
    onde: "Painel da Treg → chave de API (token usado no cabeçalho X-Treg-Token).",
  },
  openrouter: {
    nome: "OpenRouter",
    para: "Modelos de IA pelo OpenRouter, usando o modelo gratuito openrouter/free.",
    onde: "openrouter.ai → Keys → Create Key (a chave começa com sk-or-).",
  },
}

/** Chaves de serviços externos da conta. Só admin+; a chave é cifrada e nunca volta ao navegador. */
export function ApiKeysSettings() {
  const { canEditSettings } = useAuth()
  const [chaves, setChaves] = useState<StatusChave[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const r = await fetch("/api/integracoes/chaves", { cache: "no-store" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return setErro(d.error ?? "Não foi possível carregar as chaves.")
    setErro(null)
    setChaves(d.chaves)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0)
    return () => clearTimeout(t)
  }, [carregar])

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Chaves de API"
        description="Credenciais dos serviços externos usados pelo CRM. Ficam cifradas no banco e nunca são exibidas de novo."
      />
      {!canEditSettings && (
        <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">Apenas administradores podem gerenciar as chaves.</p>
      )}
      {erro && <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {!chaves && !erro && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
      <div className="space-y-3">
        {chaves?.map((c) => (
          <CartaoChave key={c.provider} status={c} editavel={canEditSettings} onChange={setChaves} />
        ))}
      </div>
    </section>
  )
}

function CartaoChave({
  status,
  editavel,
  onChange,
}: {
  status: StatusChave
  editavel: boolean
  onChange: (c: StatusChave[]) => void
}) {
  const info = SERVICOS[status.provider]
  const [valor, setValor] = useState("")
  const [busy, setBusy] = useState(false)

  async function chamar(init: RequestInit, url = "/api/integracoes/chaves") {
    setBusy(true)
    const r = await fetch(url, init)
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      toast.error(d.error ?? "Falha ao salvar a chave.")
      return false
    }
    onChange(d.chaves)
    return true
  }

  async function salvar() {
    const ok = await chamar({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: status.provider, api_key: valor }),
    })
    if (ok) {
      setValor("")
      toast.success(`Chave do ${info.nome} salva.`)
    }
  }

  const confirmar = useConfirmarExclusao()
  async function remover() {
    if (!(await confirmar({ titulo: `Remover a chave do ${info.nome}?`, confirmar: "Remover" }))) return
    if (await chamar({ method: "DELETE" }, `/api/integracoes/chaves?provider=${status.provider}`)) toast.success("Chave removida.")
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{info.nome}</p>
          <p className="text-xs text-muted-foreground">{info.para}</p>
          <p className="mt-1 text-xs text-muted-foreground">Onde achar: {info.onde}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${status.configurada ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
        >
          {!status.configurada
            ? "Não configurada"
            : status.origem === "instalacao"
              ? "Usando a chave da instalação"
              : `Configurada · …${status.hint ?? ""}`}
        </span>
      </div>
      {editavel && (
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder={status.origem === "conta" ? "Colar uma nova chave para substituir" : "Colar a chave"}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Button onClick={salvar} disabled={busy || valor.trim().length < 10}>
            {busy && <Loader2 className="mr-1 size-4 animate-spin" />}Salvar
          </Button>
          {status.origem === "conta" && (
            <Button variant="outline" size="icon" onClick={remover} disabled={busy} aria-label="Remover chave">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
