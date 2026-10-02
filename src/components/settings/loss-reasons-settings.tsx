"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SettingsPanelHead } from "./settings-panel-head"

interface Motivo {
  id: string
  name: string
  active: boolean
}

/** Motivos oferecidos ao marcar um negócio como perdido. Só admin+ edita. */
export function LossReasonsSettings() {
  const supabase = createClient()
  const { accountId, canEditSettings } = useAuth()
  const [motivos, setMotivos] = useState<Motivo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("loss_reasons").select("id,name,active").order("created_at")
    if (error) return setErro(error.message)
    setErro(null)
    setMotivos((data ?? []) as Motivo[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  const msg = (e: { code?: string; message: string }) =>
    e.code === "23505" ? "Já existe um motivo com esse nome." : e.message

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    const nome = novo.trim()
    if (!nome || !accountId) return
    setSalvando(true)
    const { error } = await supabase.from("loss_reasons").insert({ account_id: accountId, name: nome })
    setSalvando(false)
    if (error) return toast.error(msg(error))
    setNovo("")
    carregar()
  }

  async function renomear() {
    if (!editando) return
    const nome = editando.nome.trim()
    if (!nome) return toast.error("Informe o nome.")
    const { error } = await supabase.from("loss_reasons").update({ name: nome }).eq("id", editando.id)
    if (error) return toast.error(msg(error))
    setEditando(null)
    carregar()
  }

  async function alternar(m: Motivo) {
    const { error } = await supabase.from("loss_reasons").update({ active: !m.active }).eq("id", m.id)
    if (error) return toast.error(error.message)
    carregar()
  }

  async function excluir(m: Motivo) {
    if (!window.confirm(`Excluir o motivo "${m.name}"? Negócios já perdidos com ele mantêm o texto.`)) return
    const { error } = await supabase.from("loss_reasons").delete().eq("id", m.id)
    if (error) return toast.error(error.message)
    carregar()
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Motivos de perda"
        description="Opções exibidas ao marcar um negócio como perdido. Os relatórios agrupam por esses motivos. Editar ou excluir aqui não altera negócios já perdidos."
      />
      {canEditSettings && (
        <form onSubmit={adicionar} className="mb-4 flex max-w-md gap-2">
          <Input placeholder="Novo motivo (ex.: Prazo de entrega)" value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={80} />
          <Button type="submit" disabled={salvando || !novo.trim()}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
          </Button>
        </form>
      )}
      {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {!motivos && !erro && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
      {motivos && motivos.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum motivo cadastrado.</p>
      )}
      <ul className="max-w-xl divide-y rounded-xl border bg-card">
        {motivos?.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            {editando?.id === m.id ? (
              <>
                <Input
                  autoFocus
                  value={editando.nome}
                  onChange={(e) => setEditando({ id: m.id, nome: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renomear()
                    if (e.key === "Escape") setEditando(null)
                  }}
                  className="h-8"
                />
                <Button size="icon-sm" variant="ghost" onClick={renomear} aria-label="Salvar"><Check /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setEditando(null)} aria-label="Cancelar"><X /></Button>
              </>
            ) : (
              <>
                <span className={`flex-1 ${m.active ? "" : "text-muted-foreground line-through"}`}>{m.name}</span>
                {canEditSettings && (
                  <>
                    <Switch checked={m.active} onCheckedChange={() => alternar(m)} aria-label="Ativo" />
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditando({ id: m.id, nome: m.name })} aria-label="Renomear"><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => excluir(m)} aria-label="Excluir"><Trash2 /></Button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
