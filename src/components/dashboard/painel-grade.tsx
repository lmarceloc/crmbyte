"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Responsive, useContainerWidth, type Layout, type LayoutItem, type ResponsiveLayouts } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "./painel-grade.css"
import { GripVertical, LayoutGrid, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface Bloco {
  id: string
  conteudo: ReactNode
  /** Posição/tamanho padrão na grade de 12 colunas. */
  padrao: Omit<LayoutItem, "i">
}

const CHAVE = "painel-layout-v1"
const COLS = { lg: 12, sm: 1 }
const BREAKPOINTS = { lg: 900, sm: 0 }

function lerSalvo(): ResponsiveLayouts | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as ResponsiveLayouts) : null
  } catch {
    return null
  }
}

/** Grade do Painel: o usuário arrasta e redimensiona os blocos; o arranjo fica salvo neste navegador. */
export function PainelGrade({ blocos }: { blocos: Bloco[] }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [editando, setEditando] = useState(false)

  const padrao = useMemo<ResponsiveLayouts>(() => {
    const lg = blocos.map((b) => ({ i: b.id, minW: 2, minH: 2, ...b.padrao }))
    const ordem = [...lg].sort((a, b) => a.y - b.y || a.x - b.x)
    // celular: uma coluna, na ordem de leitura (a compactação vertical tira os buracos)
    const sm = ordem.map((it, n) => ({ ...it, x: 0, y: n * 100, w: 1, minW: 1 }))
    return { lg, sm }
  }, [blocos])

  // a grade só renderiza depois de montar (largura medida), então ler o localStorage aqui não quebra a hidratação
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => lerSalvo() ?? padrao)

  function aoMudar(_: Layout, todos: ResponsiveLayouts) {
    setLayouts(todos)
    if (!editando) return
    try {
      localStorage.setItem(CHAVE, JSON.stringify(todos))
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }

  function restaurar() {
    setLayouts(padrao)
    try {
      localStorage.removeItem(CHAVE)
    } catch {
      /* ignora */
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {editando && (
          <Button size="sm" variant="ghost" onClick={restaurar}>
            <RotateCcw className="size-3.5" /> Restaurar padrão
          </Button>
        )}
        <Button size="sm" variant={editando ? "default" : "outline"} onClick={() => setEditando((v) => !v)}>
          <LayoutGrid className="size-3.5" /> {editando ? "Concluir" : "Organizar painel"}
        </Button>
      </div>
      <div ref={containerRef}>
        {mounted && (
          <Responsive
            width={width}
            layouts={layouts}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={40}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: editando, handle: ".painel-alca" }}
            resizeConfig={{ enabled: editando, handles: ["se", "e", "s"] }}
            onLayoutChange={aoMudar}
          >
            {blocos.map((b) => (
              // a alça de redimensionar é filha deste div: ele não pode rolar nem esticar os filhos,
              // senão a alça some junto com o conteúdo
              <div key={b.id} className={`rounded-xl ${editando ? "painel-editando ring-2 ring-primary/40" : ""}`}>
                <div className="h-full overflow-auto rounded-xl [&>*]:min-h-full">{b.conteudo}</div>
                {editando && (
                  <div className="painel-alca absolute top-2 left-1/2 z-10 flex -translate-x-1/2 cursor-move items-center rounded-md border bg-background/90 px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
                    <GripVertical className="size-3.5" /> arrastar
                  </div>
                )}
              </div>
            ))}
          </Responsive>
        )}
      </div>
    </div>
  )
}
