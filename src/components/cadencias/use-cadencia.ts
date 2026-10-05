"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Cadencia, StatusDaCadencia } from "@/lib/cadencias/tipos"

type Edicao = Partial<Pick<Cadencia, "name" | "configuracao" | "passos">>

/** Carrega a cadência; edições de conteúdo gravam com debounce de 700 ms,
 *  mudança de status é imediata e reverte se o servidor recusar. */
export function useCadencia(id: string) {
  const [cadencia, setCadencia] = useState<Cadencia | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const pendente = useRef<Edicao>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmada = useRef<Cadencia | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/cadencias/${id}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!vivo) return
        if (!ok) return setErro(body?.error ?? "Falha ao carregar a cadência.")
        confirmada.current = body.cadencia
        setCadencia(body.cadencia)
      })
    return () => {
      vivo = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [id])

  const gravar = useCallback(async () => {
    const mudanca = pendente.current
    pendente.current = {}
    if (Object.keys(mudanca).length === 0) return
    setSalvando(true)
    const res = await fetch(`/api/cadencias/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mudanca),
    })
    const body = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) {
      toast.error(body?.error ?? "Não foi possível salvar a cadência.")
      return
    }
    confirmada.current = body.cadencia
    // só o `versao`/`updated_at` vêm do servidor; não sobrescreve edições em andamento
    setCadencia((atual) => (atual ? { ...atual, versao: body.cadencia.versao, updated_at: body.cadencia.updated_at } : atual))
  }, [id])

  const editar = useCallback(
    (mudanca: Edicao) => {
      setCadencia((c) => (c ? { ...c, ...mudanca } : c))
      pendente.current = { ...pendente.current, ...mudanca }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(gravar, 700)
    },
    [gravar],
  )

  const mudarStatus = useCallback(
    async (status: StatusDaCadencia) => {
      if (timer.current) clearTimeout(timer.current)
      await gravar()
      const anterior = confirmada.current
      setCadencia((c) => (c ? { ...c, status } : c))
      const res = await fetch(`/api/cadencias/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Não foi possível mudar o status.")
        if (anterior) setCadencia((c) => (c ? { ...c, status: anterior.status } : c))
        return false
      }
      confirmada.current = body.cadencia
      setCadencia(body.cadencia)
      return true
    },
    [id, gravar],
  )

  /** Limite de lead quente: grava na hora, inclusive com a cadência ativa. */
  const mudarLimiar = useCallback(
    async (limiarLeadQuente: number) => {
      const anterior = confirmada.current
      setCadencia((c) => (c ? { ...c, configuracao: { ...c.configuracao, limiarLeadQuente } } : c))
      setSalvando(true)
      const res = await fetch(`/api/cadencias/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limiarLeadQuente }),
      })
      const body = await res.json().catch(() => ({}))
      setSalvando(false)
      if (!res.ok) {
        toast.error(body?.error ?? "Não foi possível salvar o limite de lead quente.")
        if (anterior) setCadencia((c) => (c ? { ...c, configuracao: anterior.configuracao } : c))
        return
      }
      confirmada.current = body.cadencia
      setCadencia((c) => (c ? { ...c, configuracao: body.cadencia.configuracao, updated_at: body.cadencia.updated_at } : c))
    },
    [id],
  )

  return { cadencia, erro, salvando, editar, mudarStatus, mudarLimiar }
}
