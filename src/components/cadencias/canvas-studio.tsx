"use client"

// Canvas da cadência no visual "Node Flow" (fundo escuro, cartões com portas,
// ligações animadas, mini-raio ao encaixar, brilho no cartão novo).
//
// Montagem à mão: clicar na paleta cria a caixa SOLTA no canvas (arrastável);
// arrastar da saída de uma caixa até a entrada de outra liga as duas — se o
// encaixe é aceito, a linha brilha com o mini-raio; se não, fica vermelha e
// diz por quê. Clicar numa ligação desfaz. O fluxo continua sendo uma árvore
// (regras em lib/cadencias/montagem.ts) e o worker não muda.

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
  useReactFlow,
  useStore,
  type ConnectionLineComponentProps,
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
  alturaDoTipo,
  caminhoDaLigacao,
  caminhoDoRaio,
  montarGrafo,
  pontoLivre,
  type LigacaoDoGrafo,
  type NoDoGrafo,
  type SaidaDoNo,
} from "@/lib/cadencias/grafo"
import { podeLigar, type Floresta } from "@/lib/cadencias/montagem"
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
  { secao: "Encerrar", itens: [{ tipo: "fim", rotulo: "Fim deste caminho", Icone: Flag }] },
]
const ITENS = PALETA.flatMap((s) => s.itens)
const itemDoTipo = (t: TipoDePasso) => ITENS.find((i) => i.tipo === t)!
/** No "+" do meio de uma ligação: tudo menos Fim (Fim no meio cortaria o caminho). */
const ITENS_DO_MAIS = ITENS.filter((i) => i.tipo !== "fim")

// ---------- contexto: estado e ações vistos por nós e ligações ----------

export interface PropsDoCanvasStudio {
  /** O fluxo (ligado ao gatilho) e as caixas soltas. */
  floresta: Floresta
  configuracao: ConfiguracaoDaCadencia
  somenteLeitura: boolean
  numeros: Map<string, number>
  erros: Map<string, { mensagem: string }[]>
  selecionado: string | null
  /** id do passo → marca de tempo do último "acender" (passo novo, duplicado ou ligado). */
  destaques: Record<string, number>
  onSelecionar: (id: string | null) => void
  onAbrirConfig: () => void
  /** "+" de uma ligação: insere entre as duas caixas. */
  onInserir: (ponto: PontoDeInsercao, tipo: TipoDePasso) => void
  /** Paleta: cria a caixa solta em (x, y) do canvas. */
  onCriarSolto: (tipo: TipoDePasso, x: number, y: number) => void
  onLigar: (origem: string, saida: SaidaDoNo, destino: string) => void
  /** Clique numa ligação: `destino` e o que vem depois viram um bloco solto em (x, y). */
  onDesligar: (destino: string, x: number, y: number) => void
  onMoverSolto: (bloco: string, x: number, y: number) => void
  onDuplicar: (id: string) => void
  onExcluir: (id: string) => void
}

const Ctx = createContext<PropsDoCanvasStudio | null>(null)
const useCanvas = () => useContext(Ctx)!

type DadosDoNo = { no: NoDoGrafo }
type DadosDaLigacao = { ligacao: LigacaoDoGrafo; cor: string }
type NoRf = Node<DadosDoNo>
type LigacaoRf = Edge<DadosDaLigacao>

// ---------- cartões ----------

function Saida({ id, rotulo, cor }: { id: SaidaDoNo; rotulo: string; cor?: string }) {
  const { somenteLeitura } = useCanvas()
  return (
    <div className="cs-param out" style={cor ? ({ "--cs-porta": cor } as CSSProperties) : undefined}>
      <span className="cs-name">{rotulo}</span>
      <Handle type="source" position={Position.Right} id={id} isConnectable={!somenteLeitura} />
    </div>
  )
}

function Entrada({ ligada }: { ligada: boolean }) {
  const { somenteLeitura } = useCanvas()
  return (
    <div className="cs-param in">
      <Handle type="target" position={Position.Left} id="in" isConnectable={!somenteLeitura} />
      <span className="cs-name">Entrada</span>
      {ligada && <span className="cs-check">✓</span>}
    </div>
  )
}

function detalheDoPasso(p: Passo): string | null {
  if (p.tipo === "email" && p.corpo) return corpoEmTexto(p.corpo)
  if (p.tipo === "tarefa") return `Prazo: ${p.prazoDias} ${p.prazoDias === 1 ? "dia" : "dias"}`
  if (p.tipo === "ramo") return "Ligue o Sim e o Não nas próximas caixas"
  return null
}

/** A primeira caixa de um bloco solto ainda não tem entrada. */
function temEntrada(c: PropsDoCanvasStudio, no: NoDoGrafo): boolean {
  if (!no.solto) return true
  return c.floresta.soltos.find((b) => b.id === no.solto)?.passos[0]?.id !== no.id
}

function Ferramentas({ id, duplicar }: { id: string; duplicar: boolean }) {
  const c = useCanvas()
  if (c.somenteLeitura) return null
  return (
    <>
      {duplicar && (
        <button
          type="button"
          className="cs-tool nodrag"
          aria-label="Duplicar passo"
          title="Duplicar"
          onClick={(e) => {
            e.stopPropagation()
            c.onDuplicar(id)
          }}
        >
          <Copy />
        </button>
      )}
      <button
        type="button"
        className="cs-tool del nodrag"
        aria-label="Excluir passo"
        title="Excluir"
        onClick={(e) => {
          e.stopPropagation()
          c.onExcluir(id)
        }}
      >
        <X />
      </button>
    </>
  )
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
  const numero = c.numeros.get(passo.id)

  return (
    <div
      className={cn("cs-node", no.solto && "solto", c.selecionado === passo.id && "selected", erro && "erro")}
      style={{ "--cs-cor": cor, "--cs-porta": cor, height: no.altura } as CSSProperties}
    >
      {destaque && <span key={destaque} className="cs-flash" />}
      <div className="cs-head">
        <span className="cs-head-ico">
          <Icone />
        </span>
        <span className="cs-title">
          {numero !== undefined && <span className="cs-num">{numero}.</span>} {rotulo}
        </span>
        {no.solto && <span className="cs-solta">solta</span>}
        <Ferramentas id={passo.id} duplicar />
      </div>
      <div className="cs-body">
        <div className="cs-desc">
          <div className="cs-line forte">{resumirPasso(passo)}</div>
          {erro ? <div className="cs-line erro">{erro}</div> : detalhe && <div className="cs-line">{detalhe}</div>}
        </div>
        <Entrada ligada={temEntrada(c, no)} />
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

function NoFim({ data }: NodeProps<NoRf>) {
  const c = useCanvas()
  const { no } = data
  const passo = no.passo!
  const destaque = c.destaques[passo.id]
  const erro = c.erros.get(passo.id)?.[0]?.mensagem
  return (
    <div
      className={cn("cs-node mini fim", no.solto && "solto", c.selecionado === passo.id && "selected", erro && "erro")}
      style={{ "--cs-porta": COR.fim } as CSSProperties}
      title={erro ?? "A cadência termina aqui para o lead"}
    >
      {destaque && <span key={destaque} className="cs-flash" />}
      <Handle type="target" position={Position.Left} id="in" isConnectable={!c.somenteLeitura} />
      <Flag className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Fim deste caminho</span>
      {no.solto && <span className="cs-solta">solta</span>}
      <Ferramentas id={passo.id} duplicar={false} />
    </div>
  )
}

function NoGatilho({ data }: NodeProps<NoRf>) {
  const c = useCanvas()
  const p = c.configuracao.paradas
  const paradas = [p.respondeu && "resposta", p.bounce && "bounce", p.descadastro && "descadastro", p.ganhoOuPerdido && "ganho/perdido"]
    .filter(Boolean)
    .join(", ")
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
          <div className="cs-line forte">
            Negócios com contato que tenha e-mail{c.configuracao.tagDoSegmento ? ` · tag ${c.configuracao.tagDoSegmento}` : ""}
          </div>
          <div className="cs-line">Para em: {paradas || "—"}</div>
        </div>
        <Saida id="out" rotulo="Saída" />
      </div>
    </div>
  )
}

const TIPOS_DE_NO = { passo: NoPasso, gatilho: NoGatilho, fim: NoFim }

// ---------- ligações ----------

function BotaoMais({ ponto, x, y }: { ponto: PontoDeInsercao; x: number; y: number }) {
  const c = useCanvas()
  const [aberto, setAberto] = useState(false)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        className="cs-plus nodrag nopan"
        data-ponto={JSON.stringify(ponto)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Inserir passo aqui"
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, left: 0, top: 0 }}
      >
        <Plus />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
        {ITENS_DO_MAIS.map((t) => (
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
      <BaseEdge
        id={id}
        path={caminho}
        className={cn("cs-edge-path", !c.somenteLeitura && "desligavel")}
        style={{ stroke: cor, color: cor }}
        interactionWidth={14}
      />
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

/**
 * Linha enquanto se arrasta uma ligação: azul tracejada até o cursor; ao chegar
 * perto de uma entrada que ACEITA, mini-raio do cursor até a porta; se não
 * aceita, a linha fica vermelha e mostra o motivo.
 */
function LinhaDeLigacao({ fromX, fromY, toX, toY, fromHandle, fromNode, toNode, toHandle, connectionStatus, pointer }: ConnectionLineComponentProps<NoRf>) {
  const c = useCanvas()
  const [tx, ty, zoom] = useStore((s) => s.transform)
  // `pointer` vem em coordenadas do contêiner; a linha é desenhada no espaço do fluxo
  const cursor = pointer ? { x: (pointer.x - tx) / zoom, y: (pointer.y - ty) / zoom } : { x: toX, y: toY }
  const daEntrada = fromHandle?.type === "target"
  const de = { x: fromX, y: fromY }
  const fio = (ate: { x: number; y: number }) => (daEntrada ? caminhoDaLigacao(ate, de) : caminhoDaLigacao(de, ate))

  if (connectionStatus === "invalid" && toNode && toHandle) {
    const [origem, saida, destino] = daEntrada
      ? [toNode.id, toHandle.id as SaidaDoNo, fromNode.id]
      : [fromNode.id, fromHandle.id as SaidaDoNo, toNode.id]
    const r = podeLigar(c.floresta, origem, saida, destino)
    return (
      <g>
        <path className="cs-temp-wire invalido" d={fio(cursor)} />
        {!r.ok && (
          <foreignObject x={cursor.x + 12} y={cursor.y + 10} width={260} height={60} style={{ overflow: "visible" }}>
            <div className="cs-motivo">{r.motivo}</div>
          </foreignObject>
        )}
      </g>
    )
  }
  if (connectionStatus === "valid" && toHandle) {
    const corDaOrigem = fromHandle.id === "sim" ? COR.sim : fromHandle.id === "nao" ? COR.nao : COR.ramo
    return (
      <g>
        <path className="cs-temp-wire" d={fio(cursor)} />
        <path className="cs-lightning" d={caminhoDoRaio(cursor, { x: toX, y: toY })} style={{ stroke: corDaOrigem, color: corDaOrigem }} />
      </g>
    )
  }
  return <path className="cs-temp-wire" d={fio(cursor)} />
}

// ---------- arrastar da paleta: até um "+" (insere) ou até o vazio (caixa solta) ----------

interface Arrasto {
  tipo: TipoDePasso
  inicio: { x: number; y: number }
  cursor: { x: number; y: number }
  alvo: { x: number; y: number } | null
  moveu: boolean
}

const RAIO_DE_ENCAIXE = 60

type Soltura = { tipo: TipoDePasso; ponto: PontoDeInsercao | null; cliente: { x: number; y: number } | null }

function usePaleta(onSoltar: (s: Soltura) => void) {
  const [arrasto, setArrastoState] = useState<Arrasto | null>(null)
  // espelho síncrono do estado: os ouvintes da janela leem daqui
  const atual = useRef<Arrasto | null>(null)
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
      // a caixa Fim não entra no meio de uma ligação
      if (atual.current?.tipo === "fim") {
        melhor = null
        centro = null
      }
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
    const fim = (e: PointerEvent) => {
      const el = alvoEl.current
      const a = atual.current
      marcar(null)
      definir(null)
      if (!a) return
      const ponto = el?.dataset.ponto ? (JSON.parse(el.dataset.ponto) as PontoDeInsercao) : null
      // clique = caixa solta no meio da tela; arrastado = solta onde soltou (ou insere no "+")
      soltar.current({ tipo: a.tipo, ponto, cliente: a.moveu ? { x: e.clientX, y: e.clientY } : null })
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
    const a = { tipo, inicio: { x: r.right, y: r.top + r.height / 2 }, cursor: { x: e.clientX, y: e.clientY }, alvo: null, moveu: false }
    atual.current = a
    setArrastoState(a)
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
  const { floresta, somenteLeitura, onInserir, onSelecionar, onAbrirConfig, onCriarSolto, onLigar, onDesligar, onMoverSolto } = props
  const rf = useReactFlow()
  const areaRef = useRef<HTMLDivElement>(null)
  // bloco solto sendo arrastado: desloca todas as caixas dele juntas
  const [arrastoDoBloco, setArrastoDoBloco] = useState<{ bloco: string; dx: number; dy: number } | null>(null)

  const grafo = useMemo(() => montarGrafo(floresta.passos, floresta.soltos), [floresta])

  const nodes = useMemo(() => {
    return grafo.nos.map<NoRf>((n) => {
      const d = arrastoDoBloco && n.solto === arrastoDoBloco.bloco ? arrastoDoBloco : null
      return {
        id: n.id,
        type: n.tipo,
        position: { x: n.x + (d?.dx ?? 0), y: n.y + (d?.dy ?? 0) },
        data: { no: n },
        draggable: !!n.solto && !somenteLeitura,
        selectable: false,
      }
    })
  }, [grafo, arrastoDoBloco, somenteLeitura])

  const edges = useMemo(() => {
    const porId = new Map(grafo.nos.map((n) => [n.id, n]))
    return grafo.ligacoes.map<LigacaoRf>((l) => ({
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
  }, [grafo])

  // abre enquadrando o começo do fluxo (gatilho + primeiros passos) em tamanho legível
  const [enquadrar] = useState(() => ({
    nodes: grafo.nos.filter((n) => !n.solto && n.x <= 3 * (LARGURA_DO_NO + ESPACO_X)).map((n) => ({ id: n.id })),
    padding: 0.12,
    minZoom: 0.6,
    maxZoom: 1,
  }))

  /** Espaço livre perto de `alvo` (coordenadas do fluxo): a caixa nova não cobre as portas de outra. */
  const livrePerto = (tipo: TipoDePasso, alvo: { x: number; y: number }) =>
    pontoLivre(
      grafo.nos.map((n) => ({ x: n.x, y: n.y, largura: LARGURA_DO_NO, altura: n.altura })),
      alvo,
      { largura: LARGURA_DO_NO, altura: alturaDoTipo(tipo) },
    )

  const { arrasto, iniciar } = usePaleta(({ tipo, ponto, cliente }) => {
    if (ponto) return onInserir(ponto, tipo)
    const r = areaRef.current?.getBoundingClientRect()
    if (cliente) {
      const dentro = r && cliente.x >= r.left && cliente.x <= r.right && cliente.y >= r.top && cliente.y <= r.bottom
      if (!dentro) return // arrastado e solto fora do canvas: nada
      const p = rf.screenToFlowPosition(cliente)
      const livre = livrePerto(tipo, { x: p.x - LARGURA_DO_NO / 2, y: p.y - 30 })
      return onCriarSolto(tipo, livre.x, livre.y)
    }
    // clique: perto do centro da área visível
    const centro = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 }
    const livre = livrePerto(tipo, { x: centro.x - LARGURA_DO_NO / 2, y: centro.y - alturaDoTipo(tipo) / 2 })
    onCriarSolto(tipo, livre.x, livre.y)
  })

  const motivoDe = (origem: string, saida: string | null | undefined, destino: string) =>
    podeLigar(floresta, origem, (saida ?? "out") as SaidaDoNo, destino)

  return (
    <Ctx.Provider value={props}>
      <div className="cs-studio">
        {!somenteLeitura && (
          <aside className="cs-sidebar">
            <p>Clique para criar a caixa no canvas (ou arraste até onde quiser). Depois ligue a saída de uma caixa na entrada da outra.</p>
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
        <div className="cs-canvas" ref={areaRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={TIPOS_DE_NO}
            edgeTypes={TIPOS_DE_LIGACAO}
            connectionLineComponent={LinhaDeLigacao}
            fitView
            fitViewOptions={enquadrar}
            minZoom={0.3}
            maxZoom={1.6}
            nodesDraggable={!somenteLeitura}
            nodesConnectable={!somenteLeitura}
            elementsSelectable={false}
            connectionRadius={40}
            proOptions={{ hideAttribution: true }}
            isValidConnection={(l) => !!l.source && !!l.target && motivoDe(l.source, l.sourceHandle, l.target).ok}
            onConnect={(l) => {
              if (l.source && l.target) onLigar(l.source, (l.sourceHandle ?? "out") as SaidaDoNo, l.target)
            }}
            onConnectEnd={(_e, estado) => {
              // soltou numa entrada que não aceita: diz por quê
              if (estado.isValid || !estado.toNode || !estado.fromNode || !estado.fromHandle) return
              const daEntrada = estado.fromHandle.type === "target"
              const r = daEntrada
                ? motivoDe(estado.toNode.id, estado.toHandle?.id, estado.fromNode.id)
                : motivoDe(estado.fromNode.id, estado.fromHandle.id, estado.toNode.id)
              if (!r.ok) toast.error(r.motivo)
            }}
            onEdgeClick={(e, aresta) => {
              if (somenteLeitura) return
              // o "+" e o menu dele vivem num portal, mas o clique "sobe" pela árvore do React até
              // a ligação: só o clique na própria linha (no SVG) desfaz
              const alvo = e.target as Element | null
              if (!alvo?.closest?.(".react-flow__edge") || alvo.closest(".cs-plus")) return
              const destino = grafo.nos.find((n) => n.id === aresta.target)
              if (!destino) return
              // o pedaço desligado aparece num espaço livre logo abaixo de onde estava
              const livre = pontoLivre(
                grafo.nos.filter((n) => n.id !== destino.id).map((n) => ({ x: n.x, y: n.y, largura: LARGURA_DO_NO, altura: n.altura })),
                { x: destino.x + 30, y: destino.y + destino.altura + 40 },
                { largura: LARGURA_DO_NO, altura: destino.altura },
              )
              onDesligar(aresta.target, livre.x, livre.y)
              toast("Ligação desfeita: a caixa ficou solta para você ligar em outro lugar.")
            }}
            onNodeDrag={(_e, n) => {
              const base = grafo.nos.find((x) => x.id === n.id)
              if (!base?.solto) return
              setArrastoDoBloco({ bloco: base.solto, dx: n.position.x - base.x, dy: n.position.y - base.y })
            }}
            onNodeDragStop={(_e, n) => {
              const base = grafo.nos.find((x) => x.id === n.id)
              setArrastoDoBloco(null)
              if (!base?.solto) return
              const bloco = floresta.soltos.find((b) => b.id === base.solto)
              if (!bloco) return
              const dx = n.position.x - base.x
              const dy = n.position.y - base.y
              if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
              onMoverSolto(bloco.id, bloco.x + dx, bloco.y + dy)
            }}
            onNodeClick={(_e, n) => {
              if (n.type === "passo" || n.type === "fim") onSelecionar(n.id)
              else if (n.type === "gatilho") onAbrirConfig()
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
