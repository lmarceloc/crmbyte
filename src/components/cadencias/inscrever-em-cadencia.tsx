"use client"

// Inscrição por contato (sem negócio) e "Criar negócio" de um inscrito.
//
// O contato entra na cadência sem ir para o pipeline; quando ele evolui
// (respondeu, clicou, virou lead quente…) o vendedor cria o negócio.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Briefcase, Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useCan } from "@/hooks/use-can"
import { createClient } from "@/lib/supabase/client"

interface CadenciaAtiva {
  id: string
  name: string
}

/** Botão + diálogo: escolhe uma cadência ativa e inscreve os contatos, sem negócio. */
export function InscreverEmCadencia({
  contactIds,
  rotulo = "Inscrever em cadência",
  descricao,
  onInscrito,
}: {
  contactIds: string[]
  rotulo?: string
  descricao?: string
  onInscrito?: () => void
}) {
  const pode = useCan("send-messages")
  const [aberto, setAberto] = useState(false)
  const [cadencias, setCadencias] = useState<CadenciaAtiva[] | null>(null)
  const [escolhida, setEscolhida] = useState("")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    let cancelado = false
    ;(async () => {
      const { data } = await createClient()
        .from("email_cadences")
        .select("id,name")
        .eq("status", "ativa")
        .order("name")
      if (cancelado) return
      const lista = (data ?? []) as CadenciaAtiva[]
      setCadencias(lista)
      setEscolhida((atual) => (lista.some((c) => c.id === atual) ? atual : (lista[0]?.id ?? "")))
    })()
    return () => {
      cancelado = true
    }
  }, [aberto])

  if (!pode || contactIds.length === 0) return null

  async function inscrever() {
    if (!escolhida) return
    setEnviando(true)
    const res = await fetch(`/api/cadencias/${escolhida}/inscricoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_ids: contactIds }),
    })
    const body = await res.json().catch(() => ({}))
    setEnviando(false)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao inscrever.")
    const ignorados = body.ignorados ? ` · ${body.ignorados} sem e-mail ou já inscrito(s)` : ""
    toast.success(`${body.inscritos ?? 1} contato(s) inscrito(s)${ignorados}`)
    setAberto(false)
    onInscrito?.()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Send /> {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{rotulo}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {descricao ??
                "O contato entra na cadência sem criar negócio. Quando ele evoluir, use “Criar negócio” para levá-lo ao pipeline."}
            </DialogDescription>
          </DialogHeader>
          {cadencias === null ? (
            <Loader2 className="mx-auto size-4 animate-spin" />
          ) : cadencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cadência ativa. Ative uma em Cadências.</p>
          ) : (
            <div className="space-y-1.5">
              <Label>Cadência</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={escolhida}
                onChange={(e) => setEscolhida(e.target.value)}
              >
                {cadencias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={!escolhida || enviando} onClick={inscrever}>
              {enviando && <Loader2 className="size-3.5 animate-spin" />} Inscrever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Cria o negócio de um inscrito sem negócio, no funil/etapa da cadência. */
export function CriarNegocioDaInscricao({
  cadenciaId,
  inscricaoId,
  onCriado,
}: {
  cadenciaId: string
  inscricaoId: string
  onCriado?: (negocio: { id: string; title: string }) => void
}) {
  const pode = useCan("send-messages")
  const [criando, setCriando] = useState(false)
  if (!pode) return <span className="text-muted-foreground">—</span>

  async function criar() {
    setCriando(true)
    const res = await fetch(`/api/cadencias/${cadenciaId}/inscricoes/${inscricaoId}/negocio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const body = await res.json().catch(() => ({}))
    setCriando(false)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao criar o negócio.")
    toast.success(`Negócio “${body.negocio?.title ?? ""}” criado no pipeline`)
    onCriado?.(body.negocio)
  }

  return (
    <Button size="xs" variant="outline" disabled={criando} onClick={criar} title="Levar este lead para o pipeline">
      {criando ? <Loader2 className="size-3 animate-spin" /> : <Briefcase className="size-3" />} Criar negócio
    </Button>
  )
}
