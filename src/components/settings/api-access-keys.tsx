"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, Loader2, Plug, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"

interface ChaveApi {
  id: string
  name: string
  key_hint: string
  created_at: string
  last_used_at: string | null
}

const EXEMPLO = `POST /api/integracoes/contatos
Authorization: Bearer wacrm_…

{
  "source": "apollo",
  "contatos": [{
    "name": "João Silva",
    "email": "joao@xyz.com.br",
    "phone": "5511999990000",
    "job_title": "Gerente de Logística",
    "linkedin_url": null,
    "empresa": { "name": "Transportes XYZ", "website": "https://xyz.com.br" }
  }]
}`

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR")

/** Chaves para sistemas de fora (n8n, Apollo…) mandarem contatos ao CRM. A chave define a conta. */
export function ApiAccessKeys({ editavel }: { editavel: boolean }) {
  const [chaves, setChaves] = useState<ChaveApi[] | null>(null)
  const [nome, setNome] = useState("")
  const [nova, setNova] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const confirmar = useConfirmarExclusao()

  const chamar = useCallback(async (init?: RequestInit, url = "/api/integracoes/api-keys") => {
    setBusy(true)
    const r = await fetch(url, { cache: "no-store", ...init })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      toast.error(d.error ?? "Falha ao falar com o servidor.")
      return null
    }
    setChaves(d.chaves)
    return d
  }, [])

  useEffect(() => {
    if (!editavel) return
    const t = setTimeout(() => void chamar(), 0)
    return () => clearTimeout(t)
  }, [editavel, chamar])

  async function criar() {
    const d = await chamar({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome }),
    })
    if (d) {
      setNome("")
      setNova(d.chave)
    }
  }

  async function revogar(c: ChaveApi) {
    if (!(await confirmar({ titulo: `Revogar a chave "${c.name}"?`, confirmar: "Revogar" }))) return
    if (await chamar({ method: "DELETE" }, `/api/integracoes/api-keys?id=${c.id}`)) toast.success("Chave revogada.")
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto)
    toast.success("Copiado.")
  }

  if (!editavel) return null

  return (
    <div className="mt-8 space-y-3">
      <div>
        <p className="text-sm font-semibold">Acesso à API do CRM</p>
        <p className="text-xs text-muted-foreground">
          Para outros sistemas mandarem contatos e empresas para esta conta, por exemplo o n8n importando uma lista do Apollo.
          Contatos repetidos (mesmo e-mail, telefone ou LinkedIn) não são duplicados: só os campos vazios são completados.
        </p>
      </div>

      {nova && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-medium">Copie a chave agora. Ela não será exibida de novo.</p>
          <div className="flex gap-2">
            <Input readOnly value={nova} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="icon" onClick={() => copiar(nova)} aria-label="Copiar chave">
              <Copy className="size-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNova(null)}>
            Já copiei
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Input placeholder="Nome da chave (ex.: n8n Apollo)" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
        <Button onClick={criar} disabled={busy || !nome.trim()}>
          {busy && <Loader2 className="mr-1 size-4 animate-spin" />}Gerar chave
        </Button>
      </div>

      {!chaves && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
      {chaves?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma chave ativa.</p>}
      {chaves?.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Plug className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{c.name}</p>
            <p className="text-xs text-muted-foreground">
              …{c.key_hint} · criada em {data(c.created_at)} ·{" "}
              {c.last_used_at ? `último uso em ${data(c.last_used_at)}` : "nunca usada"}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => revogar(c)} disabled={busy} aria-label="Revogar chave">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <details className="rounded-xl border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Como enviar contatos</summary>
        <p className="mt-2 text-muted-foreground">
          Até 100 contatos por chamada. Cada contato precisa de nome e de e-mail, telefone ou LinkedIn; a empresa é opcional.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono">{EXEMPLO}</pre>
      </details>
    </div>
  )
}
