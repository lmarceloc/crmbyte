"use client"

import { useState } from "react"
import { Copy, MoreVertical, Pencil, Plus, Trash2, ZoomIn, ZoomOut, Flag, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { PontoDeInsercao } from "@/lib/cadencias/arvore"
import type { ConfiguracaoDaCadencia, Passo, TipoDePasso } from "@/lib/cadencias/tipos"
import { corDoTipo, rotuloDoTipo, TIPOS } from "./status"

const ZOOMS = [0.5, 0.75, 0.9, 1, 1.1, 1.25]

export function resumirPasso(p: Passo): string {
  switch (p.tipo) {
    case "email":
      return p.mesmaConversa ? "Responde na mesma conversa" : p.assunto || "Sem assunto"
    case "espera":
      return `Aguardar ${p.diasUteis} ${p.diasUteis === 1 ? "dia útil" : "dias úteis"}`
    case "ramo":
      return p.condicao.tipo === "abriu"
        ? `Abriu ${p.condicao.vezes}× em ${p.condicao.dentroDeDias} dias?`
        : `${p.condicao.tipo === "clicou" ? "Clicou" : "Respondeu"} em ${p.condicao.dentroDeDias} dias?`
    case "whatsapp":
      return p.mensagem || "Sem mensagem"
    case "tarefa":
      return p.titulo || "Sem título"
  }
}

interface Props {
  passos: Passo[]
  configuracao: ConfiguracaoDaCadencia
  somenteLeitura: boolean
  numeros: Map<string, number>
  erros: Map<string, { mensagem: string }[]>
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  onInserir: (ponto: PontoDeInsercao, tipo: TipoDePasso) => void
  onDuplicar: (id: string) => void
  onExcluir: (id: string) => void
  onAbrirConfig: () => void
}

export function CanvasDoFluxo(props: Props) {
  const [zoom, setZoom] = useState(1)
  const { configuracao: cfg } = props
  const paradas = [
    cfg.paradas.descadastro && "descadastro",
    cfg.paradas.ganhoOuPerdido && "negócio ganho/perdido",
    cfg.paradas.respondeu && "resposta",
    cfg.paradas.bounce && "bounce",
  ].filter(Boolean)

  const mudarZoom = (d: number) => {
    const i = ZOOMS.indexOf(zoom)
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))])
  }

  return (
    <div className="relative flex-1 overflow-auto rounded-lg border bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:16px_16px]">
      <div className="sticky left-2 top-2 z-10 flex w-fit gap-1 rounded-md border bg-background p-1">
        <Button variant="ghost" size="icon-sm" onClick={() => mudarZoom(-1)}>
          <ZoomOut className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => mudarZoom(1)}>
          <ZoomIn className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center px-6 pb-10 pt-2" style={{ zoom }}>
        <button
          type="button"
          onClick={props.onAbrirConfig}
          className="flex w-72 items-center gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-sm"
        >
          <Zap className="size-4 text-amber-500" />
          <span>
            Inscrição manual
            {cfg.tagDoSegmento && <span className="text-muted-foreground"> · tag {cfg.tagDoSegmento}</span>}
            <span className="block text-xs text-muted-foreground">Negócios com contato que tenha e-mail</span>
          </span>
        </button>
        <Lista {...props} lista="raiz" passos={props.passos} fim />
        <div className="flex w-72 items-center gap-2 rounded-lg border border-dashed bg-card/60 p-3 text-xs text-muted-foreground">
          <Flag className="size-4" />
          <span>Fim · para ao: {paradas.length ? paradas.join(", ") : "—"}</span>
        </div>
      </div>
    </div>
  )
}

function Lista(props: Props & { lista: string; passos: Passo[]; fim?: boolean }) {
  const { passos, lista } = props
  return (
    <>
      <Conector {...props} ponto={{ lista, indice: 0 }} />
      {passos.map((p, i) => (
        <div key={p.id} className="flex flex-col items-center">
          {p.tipo === "ramo" ? <RamoVisual {...props} ramo={p} /> : <Cartao {...props} passo={p} />}
          {/* um ramo termina o caminho: não aceita irmão depois */}
          {p.tipo !== "ramo" && <Conector {...props} ponto={{ lista, indice: i + 1 }} />}
        </div>
      ))}
    </>
  )
}

function RamoVisual(props: Props & { ramo: Extract<Passo, { tipo: "ramo" }> }) {
  const { ramo } = props
  return (
    <div className="flex flex-col items-center">
      <Cartao {...props} passo={ramo} />
      <div className="mt-2 grid grid-cols-2 gap-6">
        {(["sim", "nao"] as const).map((lado) => (
          <div key={lado} className="flex min-w-72 flex-col items-center border-t-2 pt-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                lado === "sim" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600",
              )}
            >
              {lado === "sim" ? "Sim" : "Não"}
            </span>
            <Lista {...props} lista={`${ramo.id}:${lado}`} passos={ramo[lado]} />
            <span className="text-xs text-muted-foreground">Fim deste caminho</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Conector({ ponto, somenteLeitura, onInserir }: Props & { ponto: PontoDeInsercao }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="flex flex-col items-center">
      <div className="h-4 w-px bg-border" />
      {somenteLeitura ? (
        <div className="size-1.5 rounded-full bg-border" />
      ) : (
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger className="flex size-6 items-center justify-center rounded-full border bg-background hover:bg-muted">
            <Plus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent className="w-52 p-1">
            {TIPOS.map((t) => (
              <button
                key={t.tipo}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                onClick={() => {
                  setAberto(false)
                  onInserir(ponto, t.tipo)
                }}
              >
                <span className={cn("size-2.5 rounded-full", t.cor)} />
                {t.rotulo}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      <div className="h-4 w-px bg-border" />
    </div>
  )
}

function Cartao({ passo, ...p }: Props & { passo: Passo }) {
  const erro = p.erros.get(passo.id)?.[0]
  return (
    <div
      className={cn(
        "w-72 overflow-hidden rounded-lg border bg-card shadow-sm",
        p.selecionado === passo.id && "ring-2 ring-primary",
      )}
    >
      <div className={cn("h-1", corDoTipo(passo.tipo))} />
      <div className="flex items-start gap-2 p-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => p.onSelecionar(passo.id)}>
          <div className="text-xs text-muted-foreground">
            {p.numeros.get(passo.id)}. {rotuloDoTipo(passo.tipo)}
          </div>
          <div className="line-clamp-2 break-words text-sm">{resumirPasso(passo)}</div>
          {passo.tipo === "email" && passo.corpo && (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{passo.corpo}</div>
          )}
          {erro && <div className="mt-1 text-xs text-destructive">{erro.mensagem}</div>}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1 hover:bg-muted" aria-label="Ações">
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => p.onSelecionar(passo.id)}>
              <Pencil className="size-4" /> {p.somenteLeitura ? "Ver" : "Editar"}
            </DropdownMenuItem>
            {!p.somenteLeitura && (
              <>
                <DropdownMenuItem onClick={() => p.onDuplicar(passo.id)}>
                  <Copy className="size-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => p.onExcluir(passo.id)}>
                  <Trash2 className="size-4" /> Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
