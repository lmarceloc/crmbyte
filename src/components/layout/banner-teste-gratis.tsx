"use client"

import { useState } from "react"
import Link from "next/link"
import { Sparkles, X } from "lucide-react"

const DIA_MS = 24 * 60 * 60_000
const CHAVE = "banner-teste-fechado"

/** Dias que faltam no teste (arredonda para cima: 2h restantes = "1 dia"). */
export function diasRestantes(testeAte: string, agora = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(testeAte).getTime() - agora) / DIA_MS))
}

function lerFechado(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === "1"
  } catch {
    return false
  }
}

/** Faixa no topo do CRM durante os 7 dias grátis. Fechável até o fim da sessão, menos no último dia. */
export function BannerTesteGratis({ testeAte }: { testeAte: string }) {
  const [fechado, setFechado] = useState(lerFechado)
  const dias = diasRestantes(testeAte)
  const ultimoDia = dias <= 1
  if (fechado && !ultimoDia) return null

  const quando = new Date(testeAte).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const texto = ultimoDia
    ? `Último dia do teste grátis (termina em ${quando}).`
    : `Teste grátis: faltam ${dias} dias (até ${quando}).`

  function fechar() {
    setFechado(true)
    try {
      sessionStorage.setItem(CHAVE, "1")
    } catch {
      // sem storage: fecha só até recarregar
    }
  }

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2 text-sm ${
        ultimoDia ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-primary-soft text-foreground"
      }`}
      suppressHydrationWarning
    >
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        {texto} <span className="hidden sm:inline">Assine para o time continuar usando o CRM sem interrupção.</span>
      </p>
      <Link
        href="/settings?tab=plano"
        className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Assinar
      </Link>
      {!ultimoDia && (
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar aviso"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
