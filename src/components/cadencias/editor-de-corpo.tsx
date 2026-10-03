"use client"

import { useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { Bold, IndentDecrease, IndentIncrease, Link2, List } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  alternarLista,
  alternarNegrito,
  continuarLista,
  inserirLink,
  mudarNivelDaLista,
  urlValida,
  type Edicao,
} from "@/lib/cadencias/editor-texto"

interface Props {
  value: string
  onChange: (v: string) => void
  maxLength: number
  disabled?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onFocus?: () => void
}

function BotaoDaBarra({
  rotulo,
  dica,
  disabled,
  onClick,
  children,
}: {
  rotulo: string
  dica: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={dica}
      aria-label={rotulo}
      disabled={disabled}
      // mousedown: não tira o foco/seleção do texto antes de aplicar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * Editor simples do corpo do e-mail: barra com negrito, link e lista, mais
 * atalhos — Ctrl+B negrito, Ctrl+K link, "* " ou "- " cria lista, Tab aninha,
 * Shift+Tab sobe, Enter continua a lista. O texto fica em Markdown simples.
 */
export function EditorDeCorpo({ value, onChange, maxLength, disabled, textareaRef, onFocus }: Props) {
  const interno = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? interno
  const [linkAberto, setLinkAberto] = useState(false)
  const [linkTexto, setLinkTexto] = useState("")
  const [linkUrl, setLinkUrl] = useState("https://")
  const [linkErro, setLinkErro] = useState(false)
  const selecao = useRef({ ini: 0, fim: 0 })

  function aplicar(e: Edicao | null): boolean {
    if (!e || e.valor.length > maxLength) return false
    onChange(e.valor)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(e.ini, e.fim)
    })
    return true
  }
  const sel = () => ({
    ini: ref.current?.selectionStart ?? value.length,
    fim: ref.current?.selectionEnd ?? value.length,
  })

  function abrirLink() {
    const { ini, fim } = sel()
    selecao.current = { ini, fim }
    setLinkTexto(value.slice(ini, fim))
    setLinkUrl("https://")
    setLinkErro(false)
    setLinkAberto(true)
  }
  function confirmarLink() {
    if (!urlValida(linkUrl) || !linkTexto.trim()) return setLinkErro(true)
    const { ini, fim } = selecao.current
    aplicar(inserirLink(value, ini, fim, linkTexto.trim(), linkUrl))
    setLinkAberto(false)
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    const { ini, fim } = sel()
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault()
      aplicar(alternarNegrito(value, ini, fim))
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault()
      abrirLink()
    } else if (e.key === "Tab") {
      if (aplicar(mudarNivelDaLista(value, ini, fim, e.shiftKey ? -1 : 1))) e.preventDefault()
    } else if (e.key === "Enter" && !e.shiftKey && !mod && ini === fim) {
      if (aplicar(continuarLista(value, ini))) e.preventDefault()
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
          <BotaoDaBarra rotulo="Negrito" dica="Negrito (Ctrl+B)" disabled={disabled} onClick={() => aplicar(alternarNegrito(value, sel().ini, sel().fim))}>
            <Bold />
          </BotaoDaBarra>
          <BotaoDaBarra rotulo="Inserir link" dica="Link (Ctrl+K)" disabled={disabled} onClick={abrirLink}>
            <Link2 />
          </BotaoDaBarra>
          <BotaoDaBarra rotulo="Lista" dica="Lista com marcadores" disabled={disabled} onClick={() => aplicar(alternarLista(value, sel().ini, sel().fim))}>
            <List />
          </BotaoDaBarra>
          <span className="mx-1 h-4 w-px bg-border" />
          <BotaoDaBarra rotulo="Aninhar item" dica="Aninhar item (Tab)" disabled={disabled} onClick={() => aplicar(mudarNivelDaLista(value, sel().ini, sel().fim, 1))}>
            <IndentIncrease />
          </BotaoDaBarra>
          <BotaoDaBarra rotulo="Subir item" dica="Subir item (Shift+Tab)" disabled={disabled} onClick={() => aplicar(mudarNivelDaLista(value, sel().ini, sel().fim, -1))}>
            <IndentDecrease />
          </BotaoDaBarra>
        </div>

        {linkAberto && (
          <div className="space-y-2 border-b bg-muted/40 p-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="link-texto" className="text-xs">Texto</Label>
                <Input id="link-texto" autoFocus={!linkTexto} value={linkTexto} onChange={(e) => setLinkTexto(e.target.value)} placeholder="Agendar conversa" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-url" className="text-xs">Endereço</Label>
                <Input
                  id="link-url"
                  autoFocus={!!linkTexto}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      confirmarLink()
                    }
                  }}
                  placeholder="https://cal.com/voce"
                />
              </div>
            </div>
            {linkErro && (
              <p className="text-xs text-destructive">Informe o texto e um endereço começando com http://, https:// ou mailto:.</p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={confirmarLink}>Inserir link</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLinkAberto(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        <Textarea
          ref={ref}
          rows={14}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onFocus={onFocus}
          onKeyDown={aoTeclar}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-t-none border-0 focus-visible:ring-0"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ctrl+B negrito · Ctrl+K link · <code>*</code> ou <code>-</code> + espaço cria lista · Tab aninha · Shift+Tab sobe
      </p>
    </div>
  )
}
