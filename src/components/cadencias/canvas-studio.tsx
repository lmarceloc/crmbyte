"use client"

// Canvas da cadência no visual "Node Flow" (fundo escuro, cartões com portas,
// ligações animadas, mini-raio ao encaixar, brilho no cartão novo).
// A árvore de passos segue sendo a fonte da verdade: posições e ligações saem
// de montarGrafo(); as ações são as mesmas do canvas em lista.

import "@xyflow/react/dist/style.css"
import "./canvas-studio.css"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { Clock, Copy, Flag, GitFork, ListTodo, Mail, MessageCircle, Plus, X, Zap } from "lucide-react"
import { toast } from "sonner"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { PontoDeInsercao } from "@/lib/cadencias/arvore"
import { corpoEmTexto } from "@/lib/cadencias/corpo-rico"
import {
  ESPACO_X,
  LARGURA_DO_NO,
  caminhoDaLigacao,
  caminhoDoRaio,
  montarGrafo,
  type LigacaoDoGrafo,
  type NoDoGrafo,
  type SaidaDoNo,
} from "@/lib/cadencias/grafo"
import type { ConfiguracaoDaCadencia, Passo, TipoDePasso } from "@/lib/cadencias/tipos"
import { resumirPasso } from "./canvas"

// ---------- cores e ícones por tipo ----------

const COR = {
  gatilho: "#3b82f6",
  email: "#ec3ea9",
  whatsapp: "#49d18d",
  espera: "#f5d63b",
  ramo: "#ff9800",
  tarefa: "#a855f7",
  fim: "#8c909b",
  sim: "#49d18d",
  nao: "#ef4444",
} as const

const PALETA: { secao: string; itens: { tipo: TipoDePasso; rotulo: string; Icone: typeof Mail }[] }[] = [
  {
    secao: "Comunicação",
    itens: [
      { tipo: "email", rotulo: "E-mail", Icone: Mail },
      { tipo: "whatsapp", rotulo: "WhatsApp", Icone: MessageCircle },
    ],
  },
  {
    secao: "Controle",
    itens: [
      { tipo: "espera", rotulo: "Espera", Icone: Clock },
      { tipo: "ramo", rotulo: "Ramo (se abriu…)", Icone: GitFork },
    ],
  },
  { secao: "Automações", itens: [{ tipo: "tarefa", rotulo: "Tarefa", Icone: ListTodo }] },
]
const ITENS = PALETA.flatMap((s) => s.itens)
const itemDoTipo = (t: TipoDePasso) => ITENS.find((i) => i.tipo === t)!

// ---------- contexto: estado e ações vistos por nós e ligações ----------

export interface PropsDoCanvasStudio {
  passos: Passo[]
  configuracao: ConfiguracaoDaCadencia
  somenteLeitura: boolean
  numeros: Map<string, number>
  erros: Map<string, { mensagem: string }[]>
  selecionado: string | null
  /** id do passo → marca de tempo do último "acender" (passo novo ou duplicado). */
  destaques: Record<string, number>
  onSelecionar: (id: string | null) => void
  onInserir: (ponto: PontoDeInsercao, tipo: TipoDePasso) => void
  onDuplicar: (id: string) => void
  onExcluir: (id: string) => void
  onAbrirConfig: () => void
}

const Ctx = createContext<PropsDoCanvasStudio | null>(null)
const useCanvas = () => useContext(Ctx)!

type DadosDoNo = { no: NoDoGrafo }
type DadosDaLigacao = { ligacao: LigacaoDoGrafo; cor: string }
type NoRf = Node<DadosDoNo>
type LigacaoRf = Edge<DadosDaLigacao>

// ---------- cartões ----------

function Saida({ id, rotulo, cor }: { id: SaidaDoNo; rotulo: string; cor?: string }) {
  return (
    <div className="cs-param out" style={cor ? ({ "--cs-porta": cor } as CSSProperties) : undefined}>
      <span className="cs-name">{rotulo}</span>
      <Handle type="source" position={Position.Right} id={id} isConnectable={false} />
    </div>
  )
}

function Entrada() {
  return (
    <div className="cs-param in">
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <span className="cs-name">Entrada</span>
      <span className="cs-check">✓</span>
    </div>
  )
}

function detalheDoPasso(p: Passo): string | null {
  if (p.tipo === "email" && p.corpo) return corpoEmTexto(p.corpo)
  if (p.tipo === "tarefa") return `Prazo: ${p.prazoDias} ${p.prazoDias === 1 ? "dia" : "dias"}`
  if (p.tipo === "ramo") return "Sim segue em cima · Não segue embaixo"
  return null
}

function NoPasso({ data }: NodeProps<NoRf>) {
  const c = useCanvas()
  const { no } = data
  const passo = no.passo!
  const { rotulo, Icone } = itemDoTipo(passo.tipo)
  const cor = COR[passo.tipo]
  const erro = c.erros.get(passo.id)?.[0]?.mensagem
  const detalhe = detalheDoPasso(passo)
  const destaque = c.destaques[passo.id]

  return (
    <div
      className={cn("cs-node", c.selecionado === passo.id && "selected", erro && "erro")}
      style={{ "--cs-cor": cor, "--cs-porta": cor, height: no.altura } as CSSProperties}
    >
      {destaque && <span key={destaque} className="cs-flash" />}
      <div className="cs-head">
        <span className="cs-head-ico">
          <Icone />
        </span>
        <span className="cs-title">
          <span className="cs-num">{c.numeros.get(passo.id)}.</span> {rotulo}
        </span>
        {!c.somenteLeitura && (
          <>
            <button
              type="button"
              className="cs-tool nodrag"
              aria-label="Duplicar passo"
              title="Duplicar"
              onClick={(e) => {
                e.stopPropagation()
                c.onDuplicar(passo.id)
              }}
            >
              <Copy />
            </button>
            <button
              type="button"
              className="cs-tool del nodrag"
              aria-label="Excluir passo"
              title="Excluir"
              onClick={(e) => {
                e.stopPropagation()
                c.onExcluir(passo.id)
              }}
            >
              <X />
            </button>
          </>
        )}
      </div>
      <div className="cs-body">
        <div className="cs-desc">
          <div className="cs-line forte">{resumirPasso(passo)}</div>
          {erro ? <div className="cs-line erro">{erro}</div> : detalhe && <div className="cs-line">{detalhe}</div>}
        </div>
        <Entrada />
        {passo.tipo === "ramo" ? (
          <>
            <Saida id="sim" rotulo="Sim" cor={COR.sim} />
            <Saida id="nao" rotulo="Não" cor={COR.nao} />
          </>
        ) : (
          <Saida id="out" rotulo="Saída" />
        )}
      </div>
    </div>
  )
}

function NoGatilho({ data }: NodeProps<NoRf>) {
  const c = useCanvas()
  return (
    <div
      className="cs-node"
      style={{ "--cs-cor": COR.gatilho, "--cs-porta": COR.gatilho, height: data.no.altura } as CSSProperties}
      title="Abrir configurações"
    >
      <div className="cs-head">
        <span className="cs-head-ico">
          <Zap />
        </span>
        <span className="cs-title">Gatilho · Inscrição manual</span>
      </div>
      <div className="cs-body">
        <div className="cs-desc">
          <div className="cs-line forte">Negócios com contato que tenha e-mail</div>
          {c.configuracao.tagDoSegmento && <div className="cs-line">Tag: {c.configuracao.tagDoSegmento}</div>}
        </div>
        <Saida id="out" rotulo="Saída" />
      </div>
    </div>
  )
}

function NoFim({ data }: NodeProps<NoRf>) {
  const c = useCanvas()
  const p = c.configuracao.paradas
  const paradas = [
    p.descadastro && "descadastro",
    p.ganhoOuPerdido && "negócio ganho/perdido",
    p.respondeu && "resposta",
    p.bounce && "bounce",
  ].filter(Boolean)
  return (
    <div
      className="cs-node"
      style={{ "--cs-cor": COR.fim, "--cs-porta": COR.fim, height: data.no.altura } as CSSProperties}
      title="Abrir configurações"
    >
      <div className="cs-head">
        <span className="cs-head-ico">
          <Flag />
        </span>
        <span className="cs-title">Fim da cadência</span>
      </div>
      <div className="cs-body">
        <div className="cs-desc">
          <div className="cs-line forte">Para ao receber:</div>
          <div className="cs-line">{paradas.length ? paradas.join(", ") : "—"}</div>
        </div>
        <Entrada />
      </div>
    </div>
  )
}

function NoFimDoCaminho() {
  return (
    <div className="cs-node mini" style={{ "--cs-porta": COR.fim } as CSSProperties}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <Flag className="size-3.5" />
      Fim deste caminho
    </div>
  )
}

const TIPOS_DE_NO = { passo: NoPasso, gatilho: NoGatilho, fim: NoFim, fimDoCaminho: NoFimDoCaminho }

// ---------- ligações ----------

function BotaoMais({ ponto, x, y }: { ponto: PontoDeInsercao; x: number; y: number }) {
  const c = useCanvas()
  const [aberto, setAberto] = useState(false)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        className="cs-plus nodrag nopan"
        data-ponto={JSON.stringify(ponto)}
        aria-label="Inserir passo aqui"
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, left: 0, top: 0 }}
      >
        <Plus />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1">
        {ITENS.map((t) => (
          <button
            key={t.tipo}
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            onClick={() => {
              setAberto(false)
              c.onInserir(ponto, t.tipo)
            }}
          >
            <span className="size-2.5 rounded-full" style={{ background: COR[t.tipo] }} />
            {t.rotulo}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function LigacaoStudio({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LigacaoRf>) {
  const c = useCanvas()
  const { ligacao, cor } = data!
  const caminho = caminhoDaLigacao({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })
  return (
    <>
      <BaseEdge id={id} path={caminho} className="cs-edge-path" style={{ stroke: cor, color: cor }} interactionWidth={14} />
      <EdgeLabelRenderer>
        {ligacao.saida !== "out" && (
          <div
            className={cn("cs-edge-label", ligacao.saida)}
            style={{
              transform: `translate(0, -50%) translate(${sourceX + 14}px, ${sourceY + (ligacao.saida === "sim" ? -14 : 14)}px)`,
            }}
          >
            {ligacao.saida === "sim" ? "Sim" : "Não"}
          </div>
        )}
        {!c.somenteLeitura && <BotaoMais ponto={ligacao.ponto} x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2} />}
      </EdgeLabelRenderer>
    </>
  )
}

const TIPOS_DE_LIGACAO = { studio: LigacaoStudio }

// ---------- arrastar da paleta até um "+" ----------

interface Arrasto {
  tipo: TipoDePasso
  inicio: { x: number; y: number }
  cursor: { x: number; y: number }
  alvo: { x: number; y: number } | null
  moveu: boolean
}

const RAIO_DE_ENCAIXE = 60

function usePaleta(onSoltar: (tipo: TipoDePasso, ponto: PontoDeInsercao | null) => void) {
  const [arrasto, setArrastoState] = useState<Arrasto | null>(null)
  // espelho síncrono do estado: os ouvintes da janela leem daqui
  const atual = useRef<Arrasto | null>(null)
  const setArrasto = (a: Arrasto | null) => {
    atual.current = a
    setArrastoState(a)
  }
  const alvoEl = useRef<HTMLElement | null>(null)
  const soltar = useRef(onSoltar)
  useEffect(() => {
    soltar.current = onSoltar
  })
  const ativo = arrasto !== null

  useEffect(() => {
    if (!ativo) return
    const definir = (a: Arrasto | null) => {
      atual.current = a
      setArrastoState(a)
    }
    const marcar = (el: HTMLElement | null) => {
      if (alvoEl.current === el) return
      alvoEl.current?.classList.remove("snap-target")
      el?.classList.add("snap-target")
      alvoEl.current = el
    }
    const mover = (e: PointerEvent) => {
      let melhor: HTMLElement | null = null
      let centro: { x: number; y: number } | null = null
      let menor = RAIO_DE_ENCAIXE
      document.querySelectorAll<HTMLElement>(".cs-plus[data-ponto]").forEach((el) => {
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const d = Math.hypot(cx - e.clientX, cy - e.clientY)
        if (d < menor) {
          menor = d
          melhor = el
          centro = { x: cx, y: cy }
        }
      })
      marcar(melhor)
      const a = atual.current
      if (!a) return
      definir({
        ...a,
        cursor: { x: e.clientX, y: e.clientY },
        alvo: centro,
        moveu: a.moveu || Math.hypot(e.clientX - a.inicio.x, e.clientY - a.inicio.y) > 6,
      })
    }
    const fim = () => {
      const el = alvoEl.current
      const a = atual.current
      marcar(null)
      definir(null)
      if (!a) return
      const ponto = el?.dataset.ponto ? (JSON.parse(el.dataset.ponto) as PontoDeInsercao) : null
      // clique sem arrastar = acrescentar no fim; arrastado e solto no vazio = nada
      if (ponto || !a.moveu) soltar.current(a.tipo, ponto)
    }
    window.addEventListener("pointermove", mover)
    window.addEventListener("pointerup", fim)
    window.addEventListener("pointercancel", fim)
    return () => {
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", fim)
      window.removeEventListener("pointercancel", fim)
    }
  }, [ativo])

  const iniciar = (tipo: TipoDePasso, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const inicio = { x: r.right, y: r.top + r.height / 2 }
    setArrasto({ tipo, inicio, cursor: { x: e.clientX, y: e.clientY }, alvo: null, moveu: false })
  }

  return { arrasto, iniciar }
}

function CamadaDoArrasto({ arrasto }: { arrasto: Arrasto }) {
  if (!arrasto.moveu) return null
  const cor = COR[arrasto.tipo]
  return createPortal(
    <>
      <svg className="cs-drag-layer">
        <path className="cs-temp-wire" d={caminhoDaLigacao(arrasto.inicio, arrasto.cursor)} />
        {arrasto.alvo && (
          <path className="cs-lightning" d={caminhoDoRaio(arrasto.cursor, arrasto.alvo)} style={{ stroke: cor, color: cor }} />
        )}
      </svg>
      <div className="cs-ghost" style={{ left: arrasto.cursor.x, top: arrasto.cursor.y }}>
        {itemDoTipo(arrasto.tipo).rotulo}
      </div>
    </>,
    document.body,
  )
}

// ---------- canvas ----------

function corDaLigacao(l: LigacaoDoGrafo, nos: Map<string, NoDoGrafo>): string {
  if (l.saida === "sim") return COR.sim
  if (l.saida === "nao") return COR.nao
  const origem = nos.get(l.origem)
  return origem?.passo ? COR[origem.passo.tipo] : COR.gatilho
}

function Interno(props: PropsDoCanvasStudio) {
  const { passos, somenteLeitura, onInserir, onSelecionar, onAbrirConfig } = props

  const { nodes, edges } = useMemo(() => {
    const grafo = montarGrafo(passos)
    const porId = new Map(grafo.nos.map((n) => [n.id, n]))
    const nodes: NoRf[] = grafo.nos.map((n) => ({
      id: n.id,
      type: n.tipo,
      position: { x: n.x, y: n.y },
      data: { no: n },
      draggable: false,
      selectable: false,
    }))
    const edges: LigacaoRf[] = grafo.ligacoes.map((l) => ({
      id: l.id,
      type: "studio",
      source: l.origem,
      sourceHandle: l.saida,
      target: l.destino,
      targetHandle: "in",
      selectable: false,
      focusable: false,
      data: { ligacao: l, cor: corDaLigacao(l, porId) },
    }))
    return { nodes, edges }
  }, [passos])

  // abre enquadrando o começo do fluxo (gatilho + primeiros passos) em tamanho legível,
  // em vez de encolher a cadência inteira; o resto se vê arrastando o fundo
  const [enquadrar] = useState(() => ({
    nodes: nodes.filter((n) => n.position.x <= 3 * (LARGURA_DO_NO + ESPACO_X)).map((n) => ({ id: n.id })),
    padding: 0.12,
    minZoom: 0.6,
    maxZoom: 1,
  }))

  const { arrasto, iniciar } = usePaleta((tipo, ponto) => {
    if (ponto) return onInserir(ponto, tipo)
    // clique na paleta: acrescenta no fim do caminho principal
    if (passos.at(-1)?.tipo === "ramo")
      return toast.error("O caminho principal termina num ramo. Arraste o passo até um “+” do lado Sim ou Não.")
    onInserir({ lista: "raiz", indice: passos.length }, tipo)
  })

  return (
    <Ctx.Provider value={props}>
      <div className="cs-studio">
        {!somenteLeitura && (
          <aside className="cs-sidebar">
            <p>Arraste até um “+” da ligação ou clique para acrescentar no fim.</p>
            {PALETA.map((s) => (
              <div key={s.secao} className="flex flex-col gap-2">
                <h3>{s.secao}</h3>
                {s.itens.map((i) => (
                  <button
                    key={i.tipo}
                    type="button"
                    className="cs-action-card"
                    style={{ "--cs-cor": COR[i.tipo] } as CSSProperties}
                    onPointerDown={(e) => iniciar(i.tipo, e)}
                  >
                    <span className="cs-ico">
                      <i.Icone />
                    </span>
                    {i.rotulo}
                  </button>
                ))}
              </div>
            ))}
          </aside>
        )}
        <div className="cs-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={TIPOS_DE_NO}
            edgeTypes={TIPOS_DE_LIGACAO}
            fitView
            fitViewOptions={enquadrar}
            minZoom={0.3}
            maxZoom={1.6}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            // ter onNodeClick também é o que faz o React Flow deixar os cartões clicáveis
            // (nós não arrastáveis nem selecionáveis ficam com pointer-events: none)
            onNodeClick={(_e, n) => {
              if (n.type === "passo") onSelecionar(n.id)
              else if (n.type === "gatilho" || n.type === "fim") onAbrirConfig()
            }}
            onPaneClick={() => onSelecionar(null)}
          >
            <Background id="cs-grade" variant={BackgroundVariant.Lines} gap={48} lineWidth={1} color="var(--cs-grid)" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      {arrasto && <CamadaDoArrasto arrasto={arrasto} />}
    </Ctx.Provider>
  )
}

export function CanvasStudio(props: PropsDoCanvasStudio) {
  return (
    <ReactFlowProvider>
      <Interno {...props} />
    </ReactFlowProvider>
  )
}
