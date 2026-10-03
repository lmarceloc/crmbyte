"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { ROTULO_TIPO_TAREFA, TIPOS_DE_TAREFA, umRegistro, type Tarefa, type TipoDeTarefa } from "@/lib/tarefas/tipos"

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

interface ContatoOpcao {
  id: string
  name: string | null
  email: string | null
}
interface NegocioOpcao {
  id: string
  title: string | null
}
interface Pessoa {
  user_id: string
  full_name: string | null
  email: string | null
}

/** "YYYY-MM-DDTHH:mm" no fuso local, para o <input type="datetime-local">. */
function paraInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function emDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(dias === 0 ? Math.min(23, d.getHours() + 1) : 9, 0, 0, 0)
  return paraInput(d)
}

export function NovaTarefaDialog({
  open,
  onOpenChange,
  onCriada,
  contatoId,
  negocioId,
  tipoInicial = "retornar_ligacao",
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCriada: (t: Tarefa) => void
  /** Vínculo fixo (aberto a partir do painel de um contato/negócio). */
  contatoId?: string
  negocioId?: string
  tipoInicial?: TipoDeTarefa
}) {
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [tipo, setTipo] = useState<TipoDeTarefa>(tipoInicial)
  const [prazo, setPrazo] = useState(() => emDias(1))
  const [responsavel, setResponsavel] = useState("")
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [busca, setBusca] = useState("")
  const [opcoes, setOpcoes] = useState<ContatoOpcao[]>([])
  const [contato, setContato] = useState<ContatoOpcao | null>(null)
  const [negocios, setNegocios] = useState<NegocioOpcao[]>([])
  const [negocio, setNegocio] = useState("")
  const [salvando, setSalvando] = useState(false)

  const contatoFinal = contatoId ?? contato?.id ?? null
  const vinculoFixo = !!(contatoId || negocioId)

  // reabrir limpa o formulário
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      setTitulo("")
      setDescricao("")
      setTipo(tipoInicial)
      setPrazo(emDias(1))
      setBusca("")
      setOpcoes([])
      setContato(null)
      setNegocio("")
    }, 0)
    return () => clearTimeout(t)
  }, [open, tipoInicial])

  // responsáveis possíveis: membros da conta (a RLS de profiles já limita)
  useEffect(() => {
    if (!open) return
    let vivo = true
    void createClient()
      .from("profiles")
      .select("user_id,full_name,email")
      .then(({ data }) => vivo && setPessoas((data ?? []) as Pessoa[]))
    return () => {
      vivo = false
    }
  }, [open])

  // busca de contato (só sem vínculo fixo)
  useEffect(() => {
    if (!open || vinculoFixo || contato || busca.trim().length < 2) {
      const t = setTimeout(() => setOpcoes([]), 0)
      return () => clearTimeout(t)
    }
    let vivo = true
    const t = setTimeout(async () => {
      const termo = busca.trim().replace(/[%,()]/g, " ")
      const { data } = await createClient()
        .from("contacts")
        .select("id,name,email")
        .or(`name.ilike.%${termo}%,email.ilike.%${termo}%`)
        .limit(6)
      if (vivo) setOpcoes((data ?? []) as ContatoOpcao[])
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [busca, open, vinculoFixo, contato])

  // negócios do contato escolhido
  useEffect(() => {
    if (!open || negocioId || !contatoFinal) {
      const t = setTimeout(() => setNegocios([]), 0)
      return () => clearTimeout(t)
    }
    let vivo = true
    void createClient()
      .from("deal_contacts")
      .select("deals(id,title)")
      .eq("contact_id", contatoFinal)
      .then(({ data }) => {
        if (!vivo) return
        const lista = (data ?? [])
          .map((r) => umRegistro(r.deals as NegocioOpcao | NegocioOpcao[] | null))
          .filter((d): d is NegocioOpcao => !!d)
        setNegocios(lista)
      })
    return () => {
      vivo = false
    }
  }, [open, negocioId, contatoFinal])

  async function salvar() {
    if (!titulo.trim()) return toast.error("Dê um título à tarefa.")
    setSalvando(true)
    try {
      const r = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
          contact_id: contatoFinal,
          deal_id: negocioId ?? (negocio || null),
          responsavel_id: responsavel || null,
          prazo_em: prazo ? new Date(prazo).toISOString() : null,
        }),
      })
      const d = (await r.json()) as { tarefa?: Tarefa; error?: string }
      if (!r.ok || !d.tarefa) throw new Error(d.error ?? "Não foi possível criar a tarefa.")
      toast.success("Tarefa criada")
      onCriada(d.tarefa)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a tarefa.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>Fica registrada no histórico do contato e do negócio e avisa o responsável no sininho.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-titulo">Título</Label>
            <Input
              id="tarefa-titulo"
              value={titulo}
              maxLength={300}
              autoFocus
              placeholder="Ex.: Retornar a ligação sobre a proposta"
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !salvando && void salvar()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-tipo">Tipo</Label>
              <select id="tarefa-tipo" className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeTarefa)}>
                {TIPOS_DE_TAREFA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_TAREFA[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-resp">Responsável</Label>
              <select id="tarefa-resp" className={CAMPO} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">Eu</option>
                {pessoas.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.full_name || p.email || "Usuário"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tarefa-prazo">Prazo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="tarefa-prazo" type="datetime-local" className={`${CAMPO} w-auto`} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              <Button type="button" size="sm" variant="outline" onClick={() => setPrazo(emDias(0))}>Hoje</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPrazo(emDias(1))}>Amanhã</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPrazo(emDias(3))}>3 dias</Button>
            </div>
          </div>

          {!vinculoFixo && (
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-contato">Contato (opcional)</Label>
              {contato ? (
                <div className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm">
                  <span className="truncate">{contato.name || contato.email || "Contato"}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setContato(null); setNegocio(""); setBusca("") }}>
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <Input id="tarefa-contato" value={busca} placeholder="Buscar por nome ou e-mail" onChange={(e) => setBusca(e.target.value)} />
                  {opcoes.length > 0 && (
                    <ul className="divide-y rounded-lg border text-sm">
                      {opcoes.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="w-full px-2.5 py-1.5 text-left hover:bg-muted/60" onClick={() => setContato(c)}>
                            {c.name || "Sem nome"} <span className="text-xs text-muted-foreground">{c.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {!negocioId && contatoFinal && negocios.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-negocio">Negócio (opcional)</Label>
              <select id="tarefa-negocio" className={CAMPO} value={negocio} onChange={(e) => setNegocio(e.target.value)}>
                <option value="">Nenhum</option>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || "Negócio sem título"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tarefa-desc">Detalhes (opcional)</Label>
            <Textarea id="tarefa-desc" rows={3} maxLength={2000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />} Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
