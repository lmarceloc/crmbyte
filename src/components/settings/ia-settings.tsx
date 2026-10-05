"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SettingsPanelHead } from "./settings-panel-head"

const MAX_NOME = 120
const MAX_FAZ = 2000
const MAX_SERVICOS = 4000

/**
 * Quem está prospectando: o nome da empresa, o que ela faz e os serviços que oferece. A página
 * IA manda este texto ao modelo para ele ligar as dores da empresa-alvo ao que a nossa vende.
 * Só admin+ grava (RLS de `ai_company_profile`); os demais veem sem poder editar.
 */
export function IaSettings() {
  const supabase = createClient()
  const { accountId, user, canEditSettings } = useAuth()

  const [nome, setNome] = useState("")
  const [faz, setFaz] = useState("")
  const [servicos, setServicos] = useState("")
  const [salvo, setSalvo] = useState({ nome: "", faz: "", servicos: "" })
  const [carregado, setCarregado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("ai_company_profile")
      .select("company_name,what_we_do,services")
      .maybeSingle()
    if (error) toast.error("Não foi possível carregar os dados da empresa.")
    const atual = {
      nome: String(data?.company_name ?? ""),
      faz: String(data?.what_we_do ?? ""),
      servicos: String(data?.services ?? ""),
    }
    setNome(atual.nome)
    setFaz(atual.faz)
    setServicos(atual.servicos)
    setSalvo(atual)
    setCarregado(true)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0)
    return () => clearTimeout(t)
  }, [carregar])

  const alterado = nome.trim() !== salvo.nome || faz.trim() !== salvo.faz || servicos.trim() !== salvo.servicos

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const n = nome.trim()
    const f = faz.trim()
    const s = servicos.trim()
    if (!n) return toast.error("Informe o nome da empresa.")
    if (!s) return toast.error("Liste os serviços e produtos que a empresa oferece.")
    if (!accountId) return toast.error("Seu perfil não está vinculado a uma conta.")

    setSalvando(true)
    const { error } = await supabase
      .from("ai_company_profile")
      .upsert(
        { account_id: accountId, company_name: n, what_we_do: f, services: s, updated_by: user?.id ?? null },
        { onConflict: "account_id" },
      )
    setSalvando(false)
    if (error) return toast.error("Não foi possível salvar.")
    setSalvo({ nome: n, faz: f, servicos: s })
    setNome(n)
    setFaz(f)
    setServicos(s)
    toast.success("Dados da empresa salvos.")
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="IA"
        description="Quem está prospectando. A página IA usa estes textos para escrever e-mails que ligam as dores da empresa-alvo ao que a sua empresa oferece."
      />
      {!canEditSettings && (
        <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">Apenas administradores podem editar estes dados.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="size-4 text-primary" />
            Sua empresa
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            O modelo só promete o que estiver na lista de serviços, então seja específico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!carregado ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : (
            <form onSubmit={salvar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ia-nome-empresa">Nome da empresa *</Label>
                <Input
                  id="ia-nome-empresa"
                  value={nome}
                  maxLength={MAX_NOME}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Agência Byte"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ia-faz">O que a empresa faz</Label>
                <Textarea
                  id="ia-faz"
                  value={faz}
                  maxLength={MAX_FAZ}
                  onChange={(e) => setFaz(e.target.value)}
                  rows={5}
                  placeholder="Ex.: Somos uma empresa de tecnologia que resolve gargalos operacionais de médias empresas."
                  disabled={!canEditSettings}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {faz.length.toLocaleString("pt-BR")} / {MAX_FAZ.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ia-servicos">Serviços e produtos que oferece *</Label>
                <Textarea
                  id="ia-servicos"
                  value={servicos}
                  maxLength={MAX_SERVICOS}
                  onChange={(e) => setServicos(e.target.value)}
                  rows={7}
                  placeholder="Ex.: Software sob medida, integração entre sistemas, automação de processos, IA, BI e consultoria."
                  disabled={!canEditSettings}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {servicos.length.toLocaleString("pt-BR")} / {MAX_SERVICOS.toLocaleString("pt-BR")}
                </p>
              </div>
              {canEditSettings && (
                <Button type="submit" disabled={salvando || !alterado}>
                  {salvando && <Loader2 className="mr-1 size-4 animate-spin" />}Salvar
                </Button>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
