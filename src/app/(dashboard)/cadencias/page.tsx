"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Mail, Plus, Trash2 } from "lucide-react"

import { useCan } from "@/hooks/use-can"
import { Button } from "@/components/ui/button"
import { GatedButton } from "@/components/ui/gated-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { STATUS_CADENCIA } from "@/components/cadencias/status"
import type { StatusDaCadencia } from "@/lib/cadencias/tipos"

interface Item {
  id: string
  name: string
  status: StatusDaCadencia
  total_passos: number
  updated_at: string
}

export default function CadenciasPage() {
  const router = useRouter()
  const canEdit = useCan("edit-settings")
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)
  const [nome, setNome] = useState("")
  const [tag, setTag] = useState("")
  const [criando, setCriando] = useState(false)
  const [excluir, setExcluir] = useState<Item | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    const res = await fetch("/api/cadencias")
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setErro(body?.error ?? "Falha ao carregar as cadências.")
    setItens(body.cadencias ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  async function criar() {
    setCriando(true)
    const res = await fetch("/api/cadencias", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome, ...(tag.trim() ? { tagDoSegmento: tag.trim() } : {}) }),
    })
    const body = await res.json().catch(() => ({}))
    setCriando(false)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao criar a cadência.")
    router.push(`/cadencias/${body.cadencia.id}`)
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    const res = await fetch(`/api/cadencias/${excluir.id}`, { method: "DELETE" })
    const body = await res.json().catch(() => ({}))
    setExcluindo(false)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao excluir.")
    toast.success("Cadência excluída")
    setExcluir(null)
    carregar()
  }

  if (erro) return <div className="p-6 text-sm text-destructive">{erro}</div>
  if (!itens)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Cadências de e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Sequências automáticas de e-mail, espera e ramificação por abertura.
          </p>
        </div>
        <GatedButton canAct={canEdit} gateReason="criar cadências" onClick={() => setNovaAberta(true)}>
          <Plus className="size-4" /> Nova cadência
        </GatedButton>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma cadência ainda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {itens.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4">
              <Link href={`/cadencias/${c.id}`} className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={STATUS_CADENCIA[c.status].variant}>{STATUS_CADENCIA[c.status].rotulo}</Badge>
                  <span>
                    {c.total_passos} {c.total_passos === 1 ? "passo" : "passos"}
                  </span>
                </div>
              </Link>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={c.status === "ativa"}
                  title={c.status === "ativa" ? "Pause a cadência antes de excluir" : "Excluir"}
                  onClick={() => setExcluir(c)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova cadência</DialogTitle>
            <DialogDescription>Você monta os passos na próxima tela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cad-nome">Nome</Label>
              <Input id="cad-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cad-tag">Tag do segmento (opcional)</Label>
              <Input id="cad-tag" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={80} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaAberta(false)}>
              Cancelar
            </Button>
            <Button disabled={!nome.trim() || criando} onClick={criar}>
              {criando && <Loader2 className="size-4 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cadência?</DialogTitle>
            <DialogDescription>
              “{excluir?.name}” e todas as inscrições e eventos dela serão apagados. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={excluindo} onClick={confirmarExclusao}>
              {excluindo && <Loader2 className="size-4 animate-spin" />} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
