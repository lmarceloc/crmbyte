"use client"

// Peças compartilhadas pelos painéis laterais (empresa, contato, negócio):
// barra superior, avatar, linha de detalhe, cartão de métrica, linha do tempo
// de eventos da cadência e o hook de carregamento.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  Eye,
  Flag,
  Gauge,
  GitBranch,
  ListChecks,
  MailMinus,
  MailX,
  MailWarning,
  Reply,
  MousePointerClick,
  OctagonX,
  Paperclip,
  Send,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useDetailPanel } from "./detail-panel-provider"

// ---------------------------------------------------------------- formatação

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function relativa(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
}

/** Só http/https; devolve a URL normalizada ou null. */
export function linkSeguro(url: string | null | undefined): string | null {
  const t = url?.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

export const apenasDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")

export const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export const ROTULO_RESULTADO: Record<string, string> = {
  com_interesse: "Com interesse",
  sem_interesse: "Sem interesse",
  agendado: "Agendado",
}
export const ROTULO_MOTIVO: Record<string, string> = {
  respondeu: "respondeu",
  bounce: "e-mail devolvido",
  descadastro: "descadastrou",
  ganho_ou_perdido: "negócio ganho/perdido",
  manual: "encerrada manualmente",
  sem_email: "sem e-mail",
  falha: "falha de envio",
}
export const ROTULO_STATUS_NEGOCIO: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" }

export function situacaoInscricao(status: string, motivo: string | null): string {
  if (status === "ativa") return "Em andamento"
  if (status === "concluida") return "Concluída"
  return `Parada${motivo ? ` (${ROTULO_MOTIVO[motivo] ?? motivo})` : ""}`
}

// ------------------------------------------------------------------ carregar

/**
 * Carrega dados assíncronos. O chamador deve passar uma `fn` ESTÁVEL
 * (useCallback) e o componente é remontado por `key` ao trocar de registro.
 */
export function useCarregar<T>(fn: () => Promise<T>) {
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null; carregando: boolean }>({
    dados: null,
    erro: null,
    carregando: true,
  })
  const versao = useRef(0)

  const executar = useCallback(async () => {
    const minha = ++versao.current
    try {
      const dados = await fn()
      if (minha === versao.current) setEstado({ dados, erro: null, carregando: false })
    } catch (e) {
      if (minha === versao.current)
        setEstado((s) => ({ ...s, erro: e instanceof Error ? e.message : "Falha ao carregar.", carregando: false }))
    }
  }, [fn])

  useEffect(() => {
    void executar()
  }, [executar])

  return { ...estado, recarregar: executar }
}

// ------------------------------------------------------------------ layout

function corDoNome(nome: string): string {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 65% 50%)`
}

export function Avatar({ nome, redondo = false }: { nome: string; redondo?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-14 shrink-0 items-center justify-center text-xl font-semibold text-white ${
        redondo ? "rounded-full" : "rounded-xl"
      }`}
      style={{ backgroundColor: corDoNome(nome || "?") }}
    >
      {(nome || "?").trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Barra superior: voltar + "Tipo / Nome" + fechar. */
export function BarraSuperior({ tipo, nome }: { tipo: string; nome?: string | null }) {
  const { back, close, profundidade } = useDetailPanel()
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {profundidade > 1 && (
        <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Voltar">
          <ArrowLeft />
        </Button>
      )}
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {tipo}
        {nome ? (
          <>
            {" / "}
            <span className="font-medium text-foreground">{nome}</span>
          </>
        ) : null}
      </p>
      <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Fechar">
        <X />
      </Button>
    </div>
  )
}

export function Cabecalho({
  avatar,
  titulo,
  subtitulo,
  acoes,
}: {
  avatar: ReactNode
  titulo: string
  subtitulo?: ReactNode
  acoes?: ReactNode
}) {
  return (
    <div className="space-y-4 border-b p-5">
      <div className="flex items-center gap-4">
        {avatar}
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{titulo}</h2>
          {subtitulo && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitulo}</div>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Linha({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icone className="size-4 shrink-0" />
        {rotulo}
      </span>
      <span className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

export function Metrica({ titulo, valor, detalhe }: { titulo: string; valor: ReactNode; detalhe?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  )
}

export function Carregando() {
  return (
    <div className="space-y-3 p-5" aria-busy>
      <div className="flex items-center gap-4">
        <div className="size-14 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-muted" />
      ))}
    </div>
  )
}

export function Erro({ mensagem, onRetry }: { mensagem: string; onRetry?: () => void }) {
  return (
    <div className="m-5 space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <p>{mensagem}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>
}

// ------------------------------------------------------------- linha do tempo

export interface EventoDaLinha {
  id: string
  tipo: string
  created_at: string
  metadata: Record<string, unknown> | null
  /** "Contato · Negócio" para dar contexto quando a linha mistura vários. */
  contexto?: string | null
}

const ICONE_EVENTO: Record<string, LucideIcon> = {
  inscrito: UserPlus,
  reinscrito: UserPlus,
  email_enviado: Send,
  email_falhou: MailX,
  aberto: Eye,
  clicado: MousePointerClick,
  descadastrou: MailMinus,
  ramo_sim: GitBranch,
  ramo_nao: GitBranch,
  tarefa_criada: ListChecks,
  parada: OctagonX,
  concluida: CircleCheck,
  limite_diario_atingido: Gauge,
  fora_da_janela: Ban,
  resultado_marcado: Flag,
  respondido: Reply,
  bounce: MailWarning,
  anexo_aberto: Paperclip,
}

export function textoDoEvento(e: Pick<EventoDaLinha, "tipo" | "metadata">): string {
  const m = e.metadata ?? {}
  switch (e.tipo) {
    case "inscrito":
      return "Inscrito na cadência"
    case "reinscrito":
      return "Reinscrito na cadência"
    case "email_enviado":
      return "E-mail enviado"
    case "email_falhou":
      return "Falha ao enviar o e-mail"
    case "aberto":
      return "E-mail aberto"
    case "clicado":
      return typeof m.url === "string" ? `Clicou em ${m.url}` : "Clicou em um link"
    case "descadastrou":
      return "Pediu para não receber mais e-mails"
    case "ramo_sim":
      return "Ramo: condição atendida"
    case "ramo_nao":
      return "Ramo: condição não atendida"
    case "tarefa_criada":
      return "Tarefa criada"
    case "parada": {
      const motivo = typeof m.motivo === "string" ? (ROTULO_MOTIVO[m.motivo] ?? m.motivo) : null
      return `Cadência parada${motivo ? ` — ${motivo}` : ""}`
    }
    case "concluida":
      return "Cadência concluída"
    case "limite_diario_atingido":
      return "Limite diário de envio atingido"
    case "fora_da_janela":
      return "Aguardando a janela de envio"
    case "respondido":
      return typeof m.de === "string" ? `Respondeu o e-mail (${m.de})` : "Respondeu o e-mail"
    case "bounce":
      return typeof m.destinatario === "string"
        ? `E-mail devolvido (bounce) — ${m.destinatario}`
        : "E-mail devolvido (bounce)"
    case "resultado_marcado": {
      const r = typeof m.resultado === "string" ? (ROTULO_RESULTADO[m.resultado] ?? m.resultado) : "removido"
      return `Resultado marcado: ${r}`
    }
    case "anexo_aberto":
      return typeof m.arquivo === "string" ? `Cliente abriu o anexo ${m.arquivo}` : "Cliente abriu um anexo"
    default:
      return e.tipo
  }
}

export function LinhaDoTempo({ eventos }: { eventos: EventoDaLinha[] }) {
  if (eventos.length === 0) return <Vazio>Nenhuma atividade ainda.</Vazio>
  return (
    <ol className="space-y-3">
      {eventos.map((e) => {
        const Icone = ICONE_EVENTO[e.tipo] ?? Flag
        return (
          <li key={e.id} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icone className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="break-words">{textoDoEvento(e)}</p>
              <p className="text-xs text-muted-foreground">
                {e.contexto ? `${e.contexto} · ` : ""}
                <time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString("pt-BR")}>
                  {relativa(e.created_at)} · {dataHora(e.created_at)}
                </time>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
