"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Mail, Trash2 } from "lucide-react"

import { RequireRole } from "@/components/auth/require-role"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"

interface Caixa {
  id: string
  email: string
  from_name: string
  owner_user_id: string | null
  smtp_host: string
  smtp_port: number
  smtp_security: "starttls" | "tls" | "none"
  smtp_username: string
  tem_senha: boolean
  daily_limit: number
  verified_at: string | null
  last_error: string | null
  signature_html: string
}
interface Membro { user_id: string; full_name: string }

const PROVEDORES = [
  { nome: "Gmail / Workspace", host: "smtp.gmail.com", port: 587, security: "starttls" as const },
  { nome: "Outlook / 365", host: "smtp.office365.com", port: 587, security: "starttls" as const },
  { nome: "Zoho", host: "smtp.zoho.com", port: 465, security: "tls" as const },
  { nome: "Hostinger", host: "smtp.hostinger.com", port: 465, security: "tls" as const },
]

const VAZIO = {
  id: undefined as string | undefined,
  email: "",
  from_name: "",
  owner_user_id: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_security: "starttls" as Caixa["smtp_security"],
  smtp_username: "",
  smtp_password: "",
  daily_limit: 50,
  signature_html: "",
}

function Caixas() {
  const { account } = useAuth()
  const [caixas, setCaixas] = useState<Caixa[] | null>(null)
  const [membros, setMembros] = useState<Membro[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState(VAZIO)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    const r = await fetch("/api/caixas-de-envio")
    const d = await r.json()
    if (!r.ok) return setErro(d.error ?? "Falha ao carregar.")
    setCaixas(d.caixas)
  }, [])

  useEffect(() => {
     
    load()
  }, [load])

  useEffect(() => {
    if (!account?.id) return
    createClient()
      .from("profiles")
      .select("user_id, full_name")
      .eq("account_id", account.id)
      .then(({ data }) => setMembros((data as Membro[]) ?? []))
  }, [account?.id])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = {
        ...(f.id ? { id: f.id } : {}),
        email: f.email,
        from_name: f.from_name,
        owner_user_id: f.owner_user_id || null,
        smtp_host: f.smtp_host,
        smtp_port: f.smtp_port,
        smtp_security: f.smtp_security,
        smtp_username: f.smtp_username,
        ...(f.smtp_password ? { smtp_password: f.smtp_password } : {}),
        daily_limit: f.daily_limit,
        signature_html: f.signature_html,
      }
      const r = await fetch("/api/caixas-de-envio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) return toast.error(d.error ?? "Falha ao salvar a caixa.")
      toast.success("Caixa testada e salva.")
      setF(VAZIO)
      load()
    } finally {
      setBusy(false)
    }
  }

  const confirmar = useConfirmarExclusao()
  async function remover(c: Caixa) {
    if (!(await confirmar({ titulo: `Remover a caixa ${c.email}?`, confirmar: "Remover" }))) return
    const r = await fetch(`/api/caixas-de-envio/${c.id}`, { method: "DELETE" })
    if (!r.ok) return toast.error((await r.json()).error ?? "Falha ao remover.")
    toast.success("Caixa removida.")
    load()
  }

  function editar(c: Caixa) {
    setF({
      id: c.id,
      email: c.email,
      from_name: c.from_name,
      owner_user_id: c.owner_user_id ?? "",
      smtp_host: c.smtp_host,
      smtp_port: c.smtp_port,
      smtp_security: c.smtp_security,
      smtp_username: c.smtp_username,
      smtp_password: "",
      daily_limit: c.daily_limit,
      signature_html: c.signature_html,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const nomeDono = (id: string | null) => membros.find((m) => m.user_id === id)?.full_name ?? "Compartilhada"

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-1 h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Caixas de envio</h1>
          <p className="text-sm text-muted-foreground">
            SMTP de cada vendedor para as cadências. A senha é cifrada e nunca volta para o navegador.
          </p>
        </div>
      </div>

      <form onSubmit={salvar} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <h2 className="text-sm font-semibold">{f.id ? "Editar caixa" : "Nova caixa"}</h2>
          {PROVEDORES.map((p) => (
            <Button key={p.nome} type="button" size="sm" variant="outline"
              onClick={() => setF((x) => ({ ...x, smtp_host: p.host, smtp_port: p.port, smtp_security: p.security }))}>
              {p.nome}
            </Button>
          ))}
        </div>
        <Campo label="E-mail"><Input type="email" required value={f.email} onChange={(e) => set("email", e.target.value)} /></Campo>
        <Campo label="Nome de exibição"><Input value={f.from_name} onChange={(e) => set("from_name", e.target.value)} /></Campo>
        <Campo label="Vendedor dono da caixa">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.owner_user_id} onChange={(e) => set("owner_user_id", e.target.value)}>
            <option value="">Compartilhada</option>
            {membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </select>
        </Campo>
        <Campo label="Limite diário (1–2000)"><Input type="number" min={1} max={2000} value={f.daily_limit} onChange={(e) => set("daily_limit", Number(e.target.value))} /></Campo>
        <Campo label="Servidor SMTP"><Input required value={f.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Porta"><Input type="number" min={1} max={65535} value={f.smtp_port} onChange={(e) => set("smtp_port", Number(e.target.value))} /></Campo>
          <Campo label="Segurança">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.smtp_security} onChange={(e) => set("smtp_security", e.target.value as Caixa["smtp_security"])}>
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS (465)</option>
              <option value="none">Nenhuma</option>
            </select>
          </Campo>
        </div>
        <Campo label="Usuário SMTP"><Input value={f.smtp_username} onChange={(e) => set("smtp_username", e.target.value)} /></Campo>
        <Campo label={f.id ? "Senha (vazio mantém a atual)" : "Senha (use senha de app no Gmail/Outlook)"}>
          <Input type="password" autoComplete="new-password" value={f.smtp_password} onChange={(e) => set("smtp_password", e.target.value)} />
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Assinatura (HTML)">
            <Textarea rows={5} value={f.signature_html} onChange={(e) => set("signature_html", e.target.value)} />
          </Campo>
          {f.signature_html.trim() && (
            <iframe sandbox="" srcDoc={f.signature_html} title="Prévia da assinatura" className="mt-2 h-32 w-full rounded-md border bg-white" />
          )}
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Testar e salvar
          </Button>
          {f.id && <Button type="button" variant="ghost" onClick={() => setF(VAZIO)}>Cancelar edição</Button>}
        </div>
      </form>

      {erro ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>
      ) : caixas === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : caixas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma caixa cadastrada. Sem caixa, o envio usa o SMTP da instalação (se houver).</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {caixas.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {nomeDono(c.owner_user_id)} · {c.smtp_host}:{c.smtp_port} · {c.daily_limit}/dia
                </p>
                {c.last_error && <p className="truncate text-xs text-destructive">{c.last_error}</p>}
              </div>
              <Badge variant={c.verified_at ? "outline" : "destructive"}>{c.verified_at ? "Verificada" : "Não verificada"}</Badge>
              <Button size="sm" variant="outline" onClick={() => editar(c)}>Editar</Button>
              <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(c)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export default function Page() {
  return (
    <RequireRole min="admin">
      <Caixas />
    </RequireRole>
  )
}
