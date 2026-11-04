"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, Loader2, Plug, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"

type Acesso = "entrada" | "leitura" | "escrita"

interface ChaveApi {
  id: string
  name: string
  acesso: Acesso
  key_hint: string
  created_at: string
  last_used_at: string | null
}

const EXEMPLO = `POST /api/integracoes/contatos
Authorization: Bearer wacrm_…

{
  "source": "apollo",
  "contatos": [{
    "first_name": "João",
    "last_name": "Silva",
    "email": "joao@xyz.com.br",
    "phone": "5511999990000",
    "job_title": "Gerente de Logística",
    "linkedin_url": null,
    "empresa": { "name": "Transportes XYZ", "website": "https://xyz.com.br" }
  }]
}`

const ROTULO_ACESSO: Record<Acesso, string> = {
  entrada: "Só enviar contatos",
  leitura: "IA: somente leitura",
  escrita: "IA: leitura e escrita",
}

const OPCOES_DE_ACESSO: { valor: Acesso; texto: string }[] = [
  { valor: "entrada", texto: "Só enviar contatos (n8n, Apollo…)" },
  { valor: "leitura", texto: "IA via MCP: somente leitura" },
  { valor: "escrita", texto: "IA via MCP: leitura e escrita" },
]

const exemploMcp = (url: string) => `# Claude Code
claude mcp add --transport http crm ${url} \\
  --header "Authorization: Bearer wacrm_…"

# Outros clientes MCP (arquivo de configuração)
{
  "mcpServers": {
    "crm": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer wacrm_…" }
    }
  }
}`

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR")

/** Chaves para sistemas de fora (n8n, Apollo…) mandarem contatos ao CRM. A chave define a conta. */
export function ApiAccessKeys({ editavel }: { editavel: boolean }) {
  const [chaves, setChaves] = useState<ChaveApi[] | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [acesso, setAcesso] = useState<Acesso>("entrada")
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
    if (d.conta) setConta(d.conta)
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
      body: JSON.stringify({ name: nome, acesso }),
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

  // só existe depois de as chaves carregarem no navegador (nunca no pré-render do servidor)
  const origem = chaves ? window.location.origin : ""

  return (
    <div className="mt-8 space-y-3">
      <div>
        <p className="text-sm font-semibold">Acesso à API do CRM</p>
        <p className="text-xs text-muted-foreground">
          Para outros sistemas e a sua IA falarem com esta conta. Com a chave «só enviar contatos», o n8n pode importar uma
          lista do Apollo (contatos repetidos não são duplicados: só os campos vazios são completados). Com uma chave de IA, um
          assistente compatível com MCP consulta e cria contatos, negócios, tarefas e notas aqui dentro.
        </p>
        {conta && (
          <p className="mt-2 text-xs">
            Estas chaves gravam na conta <span className="font-semibold">{conta}</span>. Para mandar contatos a outra
            conta, gere a chave logado nela, e no n8n use uma credencial separada para cada chave.
          </p>
        )}
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

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-48 flex-1"
          placeholder="Nome da chave (ex.: n8n Apollo, Claude do João)"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
        />
        <select
          aria-label="Nível de acesso da chave"
          value={acesso}
          onChange={(e) => setAcesso(e.target.value as Acesso)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {OPCOES_DE_ACESSO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
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
              {ROTULO_ACESSO[c.acesso]} · …{c.key_hint} · criada em {data(c.created_at)} ·{" "}
              {c.last_used_at ? `último uso em ${data(c.last_used_at)}` : "nunca usada"}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => revogar(c)} disabled={busy} aria-label="Revogar chave">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      {chaves && (
        <details className="rounded-xl border p-3 text-xs">
          <summary className="cursor-pointer font-medium">Como conectar a sua IA (MCP)</summary>
          <p className="mt-2 text-muted-foreground">
            Gere uma chave de IA acima e cadastre no seu assistente o endereço abaixo, com a chave no cabeçalho
            Authorization. Somente leitura: busca contatos, funis e cadências. Leitura e escrita: também cria contatos, negócios,
            tarefas e notas, move negócios e inscreve contatos em cadências de e-mail (que passam a enviar e-mails de verdade).
          </p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={`${origem}/api/mcp`} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="icon" onClick={() => copiar(`${origem}/api/mcp`)} aria-label="Copiar endereço">
              <Copy className="size-4" />
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono">{exemploMcp(`${origem}/api/mcp`)}</pre>
        </details>
      )}

      <details className="rounded-xl border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Como enviar contatos</summary>
        <p className="mt-2 text-muted-foreground">
          Até 100 contatos por chamada. Cada contato precisa de nome (<code>first_name</code> e <code>last_name</code>, ou <code>name</code> com o nome completo) e de e-mail, telefone ou LinkedIn; a empresa é opcional.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono">{EXEMPLO}</pre>
      </details>
    </div>
  )
}
