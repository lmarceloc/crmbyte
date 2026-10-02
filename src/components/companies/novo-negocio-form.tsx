"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { etapaInicial, funilInicial, montarNegocioDaEmpresa } from "@/lib/negocio-da-empresa"

interface FunilMini {
  id: string
  name: string
}
interface EtapaMini {
  id: string
  name: string
  position: number
}

const campo =
  "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"

/**
 * Cria um negócio já amarrado à empresa (empresa → negócio). O contato entra
 * depois, no passo seguinte (`ContatosDoNegocio`): por isso aqui só o nome é
 * obrigatório — funil e etapa vêm preenchidos (primeiro funil, primeira coluna).
 */
export function NovoNegocioForm({
  empresa,
  onCriado,
  onCancelar,
}: {
  empresa: { id: string; name: string }
  onCriado: (negocio: { id: string; title: string }) => void
  onCancelar: () => void
}) {
  const supabase = createClient()
  const { accountId, user, defaultCurrency } = useAuth()

  const [titulo, setTitulo] = useState("")
  const [funis, setFunis] = useState<FunilMini[] | null>(null)
  const [funilId, setFunilId] = useState("")
  const [etapas, setEtapas] = useState<EtapaMini[]>([])
  const [etapaId, setEtapaId] = useState("")
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase.from("pipelines").select("id,name").order("created_at")
      if (cancelado) return
      if (error) toast.error("Não foi possível carregar os funis.")
      const lista = (data ?? []) as FunilMini[]
      setFunis(lista)
      setFunilId(funilInicial(lista))
    })()
    return () => {
      cancelado = true
    }
  }, [supabase])

  useEffect(() => {
    if (!funilId) return
    let cancelado = false
    ;(async () => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id,name,position")
        .eq("pipeline_id", funilId)
        .order("position")
      if (cancelado) return
      const lista = (data ?? []) as EtapaMini[]
      setEtapas(lista)
      setEtapaId(etapaInicial(lista))
    })()
    return () => {
      cancelado = true
    }
  }, [supabase, funilId])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId || !user) {
      toast.error("Seu perfil não está vinculado a uma conta.")
      return
    }
    const montado = montarNegocioDaEmpresa({
      titulo,
      empresaId: empresa.id,
      funilId,
      etapaId,
      accountId,
      userId: user.id,
      moeda: defaultCurrency,
    })
    if (!montado.ok) {
      toast.error(montado.erro)
      return
    }

    setSalvando(true)
    const { data, error } = await supabase.from("deals").insert(montado.negocio).select("id,title").single()
    setSalvando(false)
    if (error || !data) {
      toast.error("Não foi possível criar o negócio.")
      return
    }
    toast.success(`Negócio criado em ${empresa.name}`)
    onCriado({ id: data.id as string, title: data.title as string })
  }

  if (funis && funis.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <p>Esta conta ainda não tem funil. O negócio precisa de um funil para existir.</p>
        <div className="flex items-center gap-3">
          <Link href="/pipelines" className="text-primary hover:underline">
            Abrir Pipelines
          </Link>
          <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
            Fechar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={criar} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="novo-negocio-nome">Nome do negócio *</Label>
        <Input
          id="novo-negocio-nome"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={`Ex.: Proposta ${empresa.name}`}
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="novo-negocio-funil">Funil</Label>
          <select
            id="novo-negocio-funil"
            className={campo}
            value={funilId}
            disabled={!funis}
            onChange={(e) => setFunilId(e.target.value)}
          >
            {(funis ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="novo-negocio-etapa">Etapa</Label>
          <select
            id="novo-negocio-etapa"
            className={campo}
            value={etapaId}
            disabled={etapas.length === 0}
            onChange={(e) => setEtapaId(e.target.value)}
          >
            {etapas.map((et) => (
              <option key={et.id} value={et.id}>
                {et.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        O negócio fica ligado a <strong>{empresa.name}</strong>. Em seguida você adiciona o contato.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={salvando || !titulo.trim() || !funilId || !etapaId}>
          {salvando && <Loader2 className="size-4 animate-spin" />} Criar negócio
        </Button>
      </div>
    </form>
  )
}
