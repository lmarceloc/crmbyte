"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface OpcoesDeConfirmacao {
  titulo: string
  descricao?: ReactNode
  /** Rótulo do botão destrutivo. Padrão: "Excluir". */
  confirmar?: string
  cancelar?: string
}

type Confirmar = (opcoes: OpcoesDeConfirmacao) => Promise<boolean>

const Ctx = createContext<Confirmar | null>(null)

/**
 * Substituto assíncrono de `window.confirm` para exclusões:
 *   if (!(await confirmar({ titulo: "Excluir X?" }))) return
 * Sem provider, cai no `window.confirm` nativo.
 */
export function useConfirmarExclusao(): Confirmar {
  const ctx = useContext(Ctx)
  return useMemo<Confirmar>(
    () =>
      ctx ??
      (async (o) =>
        typeof window !== "undefined" &&
        window.confirm([o.titulo, typeof o.descricao === "string" ? o.descricao : ""].filter(Boolean).join("\n\n"))),
    [ctx],
  )
}

const SPRING = { type: "spring", duration: 0.35, bounce: 0.15 } as const

export function ConfirmarExclusaoProvider({ children }: { children: ReactNode }) {
  const [opcoes, setOpcoes] = useState<OpcoesDeConfirmacao | null>(null)
  const [aberto, setAberto] = useState(false)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirmar = useCallback<Confirmar>((o) => {
    // uma confirmação aberta é resolvida como "não" antes de abrir a próxima
    resolver.current?.(false)
    setOpcoes(o)
    setAberto(true)
    return new Promise<boolean>((res) => {
      resolver.current = res
    })
  }, [])

  const encerrar = useCallback((resposta: boolean) => {
    resolver.current?.(resposta)
    resolver.current = null
    setAberto(false)
  }, [])

  return (
    <Ctx.Provider value={confirmar}>
      {children}
      <MotionConfig reducedMotion="user">
        <DialogPrimitive.Root open={aberto} onOpenChange={(v) => !v && encerrar(false)}>
          <AnimatePresence>
            {aberto && opcoes && (
              <DialogPrimitive.Portal keepMounted>
                <DialogPrimitive.Backdrop
                  render={
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  }
                  className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xs"
                />
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
                  <DialogPrimitive.Popup
                    render={
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 6 }}
                        transition={SPRING}
                      />
                    }
                    className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none"
                  >
                    <div className="flex gap-3 p-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <Trash2 className="size-4" />
                      </span>
                      <div className="min-w-0 space-y-1.5">
                        <DialogPrimitive.Title className="text-base font-medium leading-snug">{opcoes.titulo}</DialogPrimitive.Title>
                        {opcoes.descricao && (
                          <DialogPrimitive.Description className="text-sm text-muted-foreground">{opcoes.descricao}</DialogPrimitive.Description>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => encerrar(false)}>
                        {opcoes.cancelar ?? "Cancelar"}
                      </Button>
                      <Button variant="destructive" autoFocus onClick={() => encerrar(true)}>
                        {opcoes.confirmar ?? "Excluir"}
                      </Button>
                    </div>
                  </DialogPrimitive.Popup>
                </div>
              </DialogPrimitive.Portal>
            )}
          </AnimatePresence>
        </DialogPrimitive.Root>
      </MotionConfig>
    </Ctx.Provider>
  )
}
