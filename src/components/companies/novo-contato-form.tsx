"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { montarContatoDaEmpresa, vinculoDoContato } from "@/lib/contato-da-empresa"
import { createClient } from "@/lib/supabase/client"

interface ContatoSemEmpresa {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
}

const campo =
  "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"

/**
 * Cartão da aba "Contatos" do painel da empresa: cria um contato já ligado à
 * empresa (`company_id`) ou vincula um que já existe e ainda não tem empresa.
 * Mesma ideia do `NovoNegocioForm`: sem sair do painel, sem modal por cima do
 * `Sheet`. Nome e e-mail são obrigatórios; cargo e telefone, opcionais.
 */
export function NovoContatoForm({
  empresa,
  onFeito,
  onCancelar,
}: {
  empresa: { id: string; name: string }
  /** Algo mudou no banco: quem chama recarrega o painel. */
  onFeito: () => void
  onCancelar: () => void
}) {
  const supabase = createClient()
  const { accountId, user } = useAuth()

  const [modo, setModo] = useState<"novo" | "existente">("novo")
  const [nome, setNome] = useState("")
  const [cargo, setCargo] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [semEmpresa, setSemEmpresa] = useState<ContatoSemEmpresa[] | null>(null)
  const [escolhido, setEscolhido] = useState("")
  const [salvando, setSalvando] = useState(false)

  // Os contatos sem empresa só são buscados se a pessoa for vincular um existente.
  useEffect(() => {
    if (modo !== "existente" || semEmpresa) return
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,name,email,phone,company")
        .is("company_id", null)
        .order("name")
        .limit(500)
      if (cancelado) return
      if (error) toast.error("Não foi possível carregar os contatos.")
      setSemEmpresa((data ?? []) as ContatoSemEmpresa[])
    })()
    return () => {
      cancelado = true
    }
  }, [modo, semEmpresa, supabase])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId || !user) {
      toast.error("Seu perfil não está vinculado a uma conta.")
      return
    }
    const montado = montarContatoDaEmpresa({ nome, cargo, email, telefone, empresa, accountId, userId: user.id })
    if (!montado.ok) {
      toast.error(montado.erro)
      return
    }
    setSalvando(true)
    const { error } = await supabase.from("contacts").insert(montado.contato)
    setSalvando(false)
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe um contato com esse telefone. Use «Vincular existente»."
          : "Não foi possível criar o contato.",
      )
      return
    }
    toast.success(`Contato criado em ${empresa.name}`)
    onFeito()
  }

  async function vincular() {
    const contato = (semEmpresa ?? []).find((c) => c.id === escolhido)
    if (!contato) return
    const vinculo = vinculoDoContato({ company_id: null, company: contato.company }, empresa)
    if (!vinculo.ok) {
      toast.error(vinculo.erro)
      return
    }
    setSalvando(true)
    // `.is("company_id", null)` fecha a janela em que outra pessoa vinculou o mesmo contato.
    const { data, error } = await supabase
      .from("contacts")
      .update(vinculo.campos)
      .eq("id", contato.id)
      .is("company_id", null)
      .select("id")
    setSalvando(false)
    if (error || !data || data.length === 0) {
      toast.error("Não foi possível vincular o contato. Ele pode ter sido vinculado por outra pessoa.")
      return
    }
    toast.success(`Contato vinculado a ${empresa.name}`)
    onFeito()
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={modo === "novo" ? "secondary" : "ghost"} onClick={() => setModo("novo")}>
          Criar novo
        </Button>
        <Button
          type="button"
          size="sm"
          variant={modo === "existente" ? "secondary" : "ghost"}
          onClick={() => setModo("existente")}
        >
          Vincular existente
        </Button>
      </div>

      {modo === "novo" ? (
        <form onSubmit={criar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="novo-contato-nome">Nome do contato *</Label>
            <Input id="novo-contato-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="novo-contato-cargo">Cargo</Label>
            <Input id="novo-contato-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="novo-contato-email">E-mail *</Label>
              <Input id="novo-contato-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="novo-contato-telefone">Telefone (opcional)</Label>
              <Input id="novo-contato-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O contato fica ligado a <strong>{empresa.name}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={salvando || !nome.trim() || !email.trim()}>
              {salvando && <Loader2 className="size-4 animate-spin" />} Criar contato
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vincular-contato">Contato que ainda não tem empresa</Label>
            <select
              id="vincular-contato"
              className={campo}
              value={escolhido}
              disabled={!semEmpresa}
              onChange={(e) => setEscolhido(e.target.value)}
            >
              <option value="">{semEmpresa ? "Escolha um contato…" : "Carregando…"}</option>
              {(semEmpresa ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.phone || c.email}
                  {c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>
            {semEmpresa && semEmpresa.length === 0 && (
              <p className="text-xs text-muted-foreground">Todos os seus contatos já têm empresa.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={vincular} disabled={salvando || !escolhido}>
              {salvando && <Loader2 className="size-4 animate-spin" />} Vincular
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
