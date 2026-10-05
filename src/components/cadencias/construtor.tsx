"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Pause, Play } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCan } from "@/hooks/use-can"
import {
  atualizarPasso,
  duplicarPasso,
  inserirPasso,
  numerarPassos,
  passoVazio,
  removerPasso,
  todosOsPassos,
  validarPassos,
} from "@/lib/cadencias/arvore"
import { configuracaoPadrao, type Cadencia, type Passo } from "@/lib/cadencias/tipos"
import { AbaConfiguracoes } from "./aba-configuracoes"
import { AbaInscritos } from "./aba-inscritos"
import { CanvasStudio } from "./canvas-studio"
import { PainelDoPasso } from "./painel-do-passo"
import { STATUS_CADENCIA } from "./status"
import { useCadencia } from "./use-cadencia"

export function Construtor({ id }: { id: string }) {
  const { cadencia, erro, salvando, editar, mudarStatus } = useCadencia(id)
  const podeEditar = useCan("edit-settings")
  const [aba, setAba] = useState("fluxo")
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [mudando, setMudando] = useState(false)
  // passos recém-inseridos/duplicados piscam no canvas
  const [destaques, setDestaques] = useState<Record<string, number>>({})

  const passos = useMemo(() => cadencia?.passos ?? [], [cadencia?.passos])
  const numeros = useMemo(() => numerarPassos(passos), [passos])
  const erros = useMemo(() => validarPassos(passos), [passos])

  if (erro) return <div className="p-6 text-sm text-destructive">{erro}</div>
  if (!cadencia)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )

  const ativa = cadencia.status === "ativa"
  const somenteLeitura = ativa || !podeEditar
  const config = { ...configuracaoPadrao(), ...cadencia.configuracao }
  const passoSel = selecionado ? (todosOsPassos(passos).find((p) => p.id === selecionado) ?? null) : null

  const setPassos = (novos: Passo[]) => editar({ passos: novos })

  function acender(ids: string[]) {
    if (ids.length === 0) return
    const agora = Date.now()
    setDestaques((d) => ({ ...d, ...Object.fromEntries(ids.map((i) => [i, agora])) }))
    setTimeout(
      () =>
        setDestaques((d) => {
          const resto = { ...d }
          for (const i of ids) if (resto[i] === agora) delete resto[i]
          return resto
        }),
      1200,
    )
  }

  async function alternar() {
    if (!cadencia) return
    if (ativa) {
      setMudando(true)
      await mudarStatus("pausada")
      return setMudando(false)
    }
    const problemas: string[] = []
    if (!todosOsPassos(passos).some((p) => p.tipo === "email")) problemas.push("Adicione pelo menos um passo de e-mail.")
    if (config.janela.dias.length === 0) problemas.push("Escolha ao menos um dia da semana na janela de envio.")
    if (erros.size > 0) problemas.push("Há passos incompletos (veja os avisos em vermelho).")
    if (problemas.length) return toast.error(problemas.join(" "))
    setMudando(true)
    if (await mudarStatus("ativa")) toast.success("Cadência ativada")
    setMudando(false)
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <Link href="/cadencias" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <Input
          className="max-w-sm font-medium"
          value={cadencia.name}
          disabled={somenteLeitura}
          maxLength={160}
          onChange={(e) => editar({ name: e.target.value })}
        />
        <Badge variant={STATUS_CADENCIA[cadencia.status].variant}>{STATUS_CADENCIA[cadencia.status].rotulo}</Badge>
        {salvando && <span className="text-xs text-muted-foreground">Salvando…</span>}
        <div className="ml-auto">
          {podeEditar && (
            <Button variant={ativa ? "outline" : "default"} disabled={mudando} onClick={alternar}>
              {mudando ? <Loader2 className="size-4 animate-spin" /> : ativa ? <Pause className="size-4" /> : <Play className="size-4" />}
              {ativa ? "Pausar" : "Revisar e ativar"}
            </Button>
          )}
        </div>
      </div>

      {ativa && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          A cadência está ativa e não pode ser editada. Pause primeiro para alterar os passos ou as configurações.
        </div>
      )}

      <Tabs value={aba} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          <TabsTrigger value="inscritos">Inscritos</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxo" className="flex min-h-0 flex-1 gap-3">
          <CanvasStudio
            passos={passos}
            destaques={destaques}
            configuracao={config}
            somenteLeitura={somenteLeitura}
            numeros={numeros}
            erros={erros}
            selecionado={selecionado}
            onSelecionar={setSelecionado}
            onAbrirConfig={() => setAba("configuracoes")}
            onInserir={(ponto, tipo) => {
              const novo = passoVazio(tipo)
              setPassos(inserirPasso(passos, ponto, novo))
              setSelecionado(novo.id)
              acender([novo.id])
            }}
            onDuplicar={(pid) => {
              const antes = new Set(todosOsPassos(passos).map((p) => p.id))
              const novos = duplicarPasso(passos, pid)
              setPassos(novos)
              acender(todosOsPassos(novos).map((p) => p.id).filter((i) => !antes.has(i)))
            }}
            onExcluir={(pid) => {
              if (selecionado === pid) setSelecionado(null)
              setPassos(removerPasso(passos, pid))
            }}
          />
          {passoSel && (
            <PainelDoPasso
              key={passoSel.id}
              passo={passoSel}
              todos={passos}
              somenteLeitura={somenteLeitura}
              onChange={(novo) => setPassos(atualizarPasso(passos, passoSel.id, () => novo))}
              onFechar={() => setSelecionado(null)}
            />
          )}
        </TabsContent>

        <TabsContent value="configuracoes" className="overflow-auto">
          <AbaConfiguracoes config={config} somenteLeitura={somenteLeitura} onChange={(c) => editar({ configuracao: c })} />
        </TabsContent>

        <TabsContent value="inscritos" className="overflow-auto">
          <AbaInscritos cadenciaId={cadencia.id} ativa={ativa} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export type { Cadencia }
