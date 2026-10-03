"use client"

import { dividirPorMencoes, type MembroComHandle } from "@/lib/mencoes"

/** Texto de nota com as @menções reconhecidas em destaque. */
export function TextoComMencoes({ texto, membros }: { texto: string; membros: MembroComHandle[] }) {
  return (
    <>
      {dividirPorMencoes(texto, membros).map((p, i) =>
        p.mencao ? (
          <span key={i} title={p.mencao.nome} className="rounded bg-primary/10 px-1 font-medium text-primary">
            {p.texto}
          </span>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  )
}
