"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DealContactsSection, type MembroDoNegocio } from "@/components/pipelines/deal-contacts-section"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import type { Contact } from "@/types"

/**
 * Contatos de UM negócio, dentro do painel da empresa (negócio → contato).
 * Mesma regra do `DealForm` em edição — cada ação grava na hora em
 * `deal_contacts`, o primeiro contato vira o principal e o trigger do banco
 * espelha o principal em `deals.contact_id` —, só que sem abrir o formulário
 * inteiro do negócio por cima do painel.
 *
 * Contato criado aqui já nasce da empresa (`company_id`), como no `DealForm`.
 */
export function ContatosDoNegocio({
  empresa,
  negocio,
  onMudou,
  onFechar,
}: {
  empresa: { id: string; name: string }
  negocio: { id: string; title: string }
  /** Algo mudou no banco: quem chama recarrega as contagens. */
  onMudou: () => void
  onFechar: () => void
}) {
  const supabase = createClient()
  const { accountId, user } = useAuth()

  const [contatos, setContatos] = useState<Contact[]>([])
  const [membros, setMembros] = useState<MembroDoNegocio[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const [c, dc] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase
          .from("deal_contacts")
          .select("contact_id,is_primary")
          .eq("deal_id", negocio.id)
          .order("created_at"),
      ])
      if (cancelado) return
      if (c.error || dc.error) toast.error("Não foi possível carregar os contatos do negócio.")
      const todos = (c.data ?? []) as Contact[]
      // Os da própria empresa primeiro: é de quem o vendedor mais provavelmente precisa.
      const daEmpresa = todos.filter((x) => x.company_id === empresa.id)
      const outros = todos.filter((x) => x.company_id !== empresa.id)
      setContatos([...daEmpresa, ...outros])
      setMembros(
        ((dc.data ?? []) as { contact_id: string; is_primary: boolean }[]).map((l) => ({
          contactId: l.contact_id,
          isPrimary: l.is_primary,
        })),
      )
      setCarregando(false)
    })()
    return () => {
      cancelado = true
    }
  }, [supabase, negocio.id, empresa.id])

  async function adicionar(contactId: string) {
    if (!accountId) {
      toast.error("Seu perfil não está vinculado a uma conta.")
      return
    }
    if (membros.some((m) => m.contactId === contactId)) return
    const primeiro = membros.length === 0
    setOcupado(true)
    const { error } = await supabase.from("deal_contacts").insert({
      account_id: accountId,
      deal_id: negocio.id,
      contact_id: contactId,
      is_primary: primeiro,
    })
    setOcupado(false)
    if (error) {
      toast.error("Não foi possível adicionar o contato.")
      return
    }
    setMembros((ms) => [...ms, { contactId, isPrimary: primeiro }])
    onMudou()
  }

  async function remover(contactId: string) {
    const removido = membros.find((m) => m.contactId === contactId)
    const restantes = membros.filter((m) => m.contactId !== contactId)
    const novoPrincipal = removido?.isPrimary ? restantes[0]?.contactId : undefined
    setOcupado(true)
    const { error } = await supabase
      .from("deal_contacts")
      .delete()
      .eq("deal_id", negocio.id)
      .eq("contact_id", contactId)
    if (!error && novoPrincipal) {
      await supabase
        .from("deal_contacts")
        .update({ is_primary: true })
        .eq("deal_id", negocio.id)
        .eq("contact_id", novoPrincipal)
    }
    setOcupado(false)
    if (error) {
      toast.error("Não foi possível remover o contato.")
      return
    }
    setMembros(restantes.map((m) => ({ ...m, isPrimary: m.isPrimary || m.contactId === novoPrincipal })))
    onMudou()
  }

  async function tornarPrincipal(contactId: string) {
    const antigo = membros.find((m) => m.isPrimary)?.contactId
    setOcupado(true)
    // Ordem importa: só pode existir um principal por negócio.
    if (antigo) {
      const r = await supabase
        .from("deal_contacts")
        .update({ is_primary: false })
        .eq("deal_id", negocio.id)
        .eq("contact_id", antigo)
      if (r.error) {
        setOcupado(false)
        toast.error("Não foi possível trocar o contato principal.")
        return
      }
    }
    const { error } = await supabase
      .from("deal_contacts")
      .update({ is_primary: true })
      .eq("deal_id", negocio.id)
      .eq("contact_id", contactId)
    setOcupado(false)
    if (error) {
      toast.error("Não foi possível trocar o contato principal.")
      return
    }
    setMembros((ms) => ms.map((m) => ({ ...m, isPrimary: m.contactId === contactId })))
    onMudou()
  }

  async function criar(d: { nome: string; email: string; telefone: string }) {
    if (!accountId || !user) {
      toast.error("Seu perfil não está vinculado a uma conta.")
      return
    }
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        account_id: accountId,
        user_id: user.id,
        name: d.nome,
        email: d.email || null,
        phone: d.telefone, // vazio é permitido ('' não entra no índice único)
        company: empresa.name,
        company_id: empresa.id,
      })
      .select("*")
      .single()
    if (error || !data) {
      toast.error(
        error?.code === "23505" ? "Já existe um contato com esse telefone." : "Não foi possível criar o contato.",
      )
      return
    }
    setContatos((cs) => [data as Contact, ...cs])
    await adicionar((data as Contact).id)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Contatos de <strong className="text-foreground">{negocio.title}</strong>
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onFechar}>
          Concluir
        </Button>
      </div>
      {carregando ? (
        <p className="text-xs text-muted-foreground">Carregando contatos…</p>
      ) : (
        <DealContactsSection
          contatos={contatos}
          membros={membros}
          ocupado={ocupado}
          onAdicionar={adicionar}
          onRemover={remover}
          onPrincipal={tornarPrincipal}
          onCriar={criar}
        />
      )}
    </div>
  )
}
