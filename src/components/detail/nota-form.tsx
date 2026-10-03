"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { MencaoTextarea } from "@/components/detail/mencao-textarea"
import { useMembros } from "@/hooks/use-membros"
import { extrairMencoes } from "@/lib/mencoes"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

/** Formulário inline de nota (contact_notes) com account_id/user_id corretos. */
export function NotaForm({
  contactId,
  dealId,
  onAdded,
  onCancel,
}: {
  contactId: string
  /** Negócio em que a nota está sendo escrita (a menção abre ele). */
  dealId?: string
  onAdded: () => void
  onCancel?: () => void
}) {
  const { accountId, user, profile } = useAuth()
  const membros = useMembros()
  const [texto, setTexto] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const t = texto.trim()
    if (!t || !accountId || !user) return
    setSalvando(true)
    const db = createClient()
    const { data: nota, error } = await db
      .from("contact_notes")
      .insert({ account_id: accountId, contact_id: contactId, user_id: user.id, note_text: t })
      .select("id")
      .single()
    if (error || !nota) {
      setSalvando(false)
      return toast.error(`Não foi possível salvar a nota: ${error?.message ?? "erro desconhecido"}`)
    }
    // @menções: avisa cada pessoa mencionada (menos você) no sininho
    const mencionados = extrairMencoes(t, membros).filter((m) => m.user_id !== user.id)
    if (mencionados.length > 0) {
      const { error: erroMencao } = await db.from("nota_mencoes").insert(
        mencionados.map((m) => ({
          account_id: accountId,
          note_id: nota.id,
          contact_id: contactId,
          deal_id: dealId ?? null,
          mencionado_id: m.user_id,
          autor_id: user.id,
          autor_nome: profile?.full_name ?? profile?.email ?? null,
          trecho: t.slice(0, 200),
        })),
      )
      if (erroMencao) toast.error(`Nota salva, mas não foi possível avisar quem foi mencionado: ${erroMencao.message}`)
    }
    setSalvando(false)
    toast.success("Nota adicionada")
    setTexto("")
    onAdded()
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <MencaoTextarea
        autoFocus
        rows={3}
        placeholder="Escreva a nota… use @ para mencionar alguém da equipe"
        value={texto}
        onChange={setTexto}
        membros={membros}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={salvar} disabled={salvando || !texto.trim()}>
          {salvando && <Loader2 className="size-3.5 animate-spin" />} Salvar nota
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
