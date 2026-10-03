"use client"

import { useMemo, useRef, useState, type KeyboardEvent } from "react"

import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { consultaDeMencao, type MembroComHandle } from "@/lib/mencoes"

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
const MAX_OPCOES = 6

/**
 * Textarea com autocomplete de @menções: ao digitar "@" lista os membros da
 * conta; ↑/↓ navegam, Enter/Tab escolhem, Esc fecha.
 */
export function MencaoTextarea({
  value,
  onChange,
  membros,
  ...props
}: {
  value: string
  onChange: (v: string) => void
  membros: MembroComHandle[]
} & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [ativo, setAtivo] = useState(0)
  const [fechado, setFechado] = useState(false)

  const consulta = useMemo(() => consultaDeMencao(value, cursor), [value, cursor])
  const opcoes = useMemo(() => {
    if (!consulta || fechado) return []
    const q = semAcento(consulta.consulta)
    return membros
      .filter((m) => q === "" || m.handle.includes(q) || semAcento(m.nome).includes(q))
      .slice(0, MAX_OPCOES)
  }, [consulta, fechado, membros])
  const aberto = opcoes.length > 0
  const indice = Math.min(ativo, Math.max(0, opcoes.length - 1))

  function escolher(m: MembroComHandle) {
    if (!consulta) return
    const depois = value.slice(cursor)
    const inserido = `@${m.handle} `
    const novo = value.slice(0, consulta.inicio) + inserido + depois
    const pos = consulta.inicio + inserido.length
    onChange(novo)
    setFechado(false)
    setAtivo(0)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
      setCursor(pos)
    })
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!aberto) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const passo = e.key === "ArrowDown" ? 1 : -1
      setAtivo((indice + passo + opcoes.length) % opcoes.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      escolher(opcoes[indice])
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      setFechado(true)
    }
  }

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        onKeyDown={aoTeclar}
        onChange={(e) => {
          onChange(e.target.value)
          setCursor(e.target.selectionStart)
          setFechado(false)
          setAtivo(0)
        }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setFechado(true), 120)}
        onFocus={() => setFechado(false)}
      />
      {aberto && (
        <ul
          role="listbox"
          aria-label="Mencionar membro"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {opcoes.map((m, i) => (
            <li key={m.user_id} role="option" aria-selected={i === indice}>
              <button
                type="button"
                // mousedown: escolhe antes de o textarea perder o foco
                onMouseDown={(e) => {
                  e.preventDefault()
                  escolher(m)
                }}
                onMouseEnter={() => setAtivo(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                  i === indice ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {m.nome.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.nome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">@{m.handle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
