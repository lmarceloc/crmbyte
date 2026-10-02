"use client"

// Painel lateral de detalhes (empresa / contato / negócio) com pilha de
// navegação: abrir a partir de uma tela zera a pilha; navegar dentro do
// painel empilha e o botão "voltar" desempilha.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { CompanyPanel } from "./company-panel"
import { ContactPanel } from "./contact-panel"
import { DealPanel } from "./deal-panel"

export type DetailRef = { type: "company" | "contact" | "deal"; id: string }

interface DetailPanelApi {
  /** Abre o painel a partir de uma tela (zera a pilha). */
  open: (ref: DetailRef) => void
  /** Navega dentro do painel (empilha). */
  push: (ref: DetailRef) => void
  back: () => void
  close: () => void
  /** Tamanho da pilha (>1 mostra o botão voltar). */
  profundidade: number
}

const noop = () => {}
const SEM_PROVIDER: DetailPanelApi = { open: noop, push: noop, back: noop, close: noop, profundidade: 0 }

const Ctx = createContext<DetailPanelApi | null>(null)

/** Seguro fora do provider: vira no-op. */
export function useDetailPanel(): DetailPanelApi {
  return useContext(Ctx) ?? SEM_PROVIDER
}

export function DetailPanelProvider({ children }: { children: ReactNode }) {
  const [pilha, setPilha] = useState<DetailRef[]>([])

  const open = useCallback((ref: DetailRef) => setPilha([ref]), [])
  const push = useCallback(
    (ref: DetailRef) =>
      setPilha((p) => {
        const topo = p[p.length - 1]
        return topo && topo.type === ref.type && topo.id === ref.id ? p : [...p, ref]
      }),
    [],
  )
  const back = useCallback(() => setPilha((p) => p.slice(0, -1)), [])
  const close = useCallback(() => setPilha([]), [])

  const atual = pilha[pilha.length - 1] ?? null
  const api = useMemo<DetailPanelApi>(
    () => ({ open, push, back, close, profundidade: pilha.length }),
    [open, push, back, close, pilha.length],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={!!atual} onOpenChange={(aberto) => !aberto && close()}>
        <SheetContent
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]"
        >
          <SheetTitle className="sr-only">Detalhes</SheetTitle>
          {/* key: ao trocar de registro o painel remonta e recarrega do zero */}
          {atual?.type === "company" && <CompanyPanel key={`c:${atual.id}`} id={atual.id} />}
          {atual?.type === "contact" && <ContactPanel key={`p:${atual.id}`} id={atual.id} />}
          {atual?.type === "deal" && <DealPanel key={`d:${atual.id}`} id={atual.id} />}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  )
}
