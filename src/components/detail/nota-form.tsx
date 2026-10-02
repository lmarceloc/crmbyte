"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

/** Formulário inline de nota (contact_notes) com account_id/user_id corretos. */
export function NotaForm({
  contactId,
  onAdded,
  onCancel,
}: {
  contactId: string
  onAdded: () => void
  onCancel?: () => void
}) {
  const { accountId, user } = useAuth()
  const [texto, setTexto] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const t = texto.trim()
    if (!t || !accountId || !user) return
    setSalvando(true)
    const { error } = await createClient()
      .from("contact_notes")
      .insert({ account_id: accountId, contact_id: contactId, user_id: user.id, note_text: t })
    setSalvando(false)
    if (error) return toast.error(`Não foi possível salvar a nota: ${error.message}`)
    toast.success("Nota adicionada")
    setTexto("")
    onAdded()
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <Textarea
        autoFocus
        rows={3}
        placeholder="Escreva a nota…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
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
