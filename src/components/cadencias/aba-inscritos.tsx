"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"

interface Inscricao {
  id: string
  status: string
  motivo_parada: string | null
  emails_enviados: number
  aberturas: number
  proximo_em: string
  deals: { title: string } | { title: string }[] | null
  contacts: { name: string | null } | { name: string | null }[] | null
}
interface Negocio {
  id: string
  title: string
  contacts: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
}

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export function AbaInscritos({ cadenciaId, ativa }: { cadenciaId: string; ativa: boolean }) {
  const podeInscrever = useCan("send-messages")
  const [lista, setLista] = useState<Inscricao[] | null>(null)
  const [busca, setBusca] = useState("")
  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [inscrevendo, setInscrevendo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/cadencias/${cadenciaId}/inscricoes?limit=200`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(body?.error ?? "Falha ao carregar os inscritos.")
    setLista(body.inscricoes ?? [])
  }, [cadenciaId])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  useEffect(() => {
    if (!ativa || !podeInscrever) return
    const t = setTimeout(async () => {
      let q = createClient()
        .from("deals")
        .select("id,title,contacts!inner(name,email)")
        .eq("status", "open")
        .not("contacts.email", "is", null)
        .neq("contacts.email", "")
        .order("created_at", { ascending: false })
        .limit(10)
      if (busca.trim()) q = q.ilike("title", `%${busca.trim()}%`)
      const { data } = await q
      setNegocios((data ?? []) as unknown as Negocio[])
    }, 300)
    return () => clearTimeout(t)
  }, [busca, ativa, podeInscrever])

  async function inscrever(id: string) {
    setInscrevendo(id)
    const res = await fetch(`/api/cadencias/${cadenciaId}/inscricoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deal_id: id }),
    })
    const body = await res.json().catch(() => ({}))
    setInscrevendo(null)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao inscrever.")
    toast.success("Negócio inscrito")
    carregar()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h3 className="font-medium">Inscrever negócio</h3>
        {!ativa ? (
          <p className="text-sm text-muted-foreground">Ative a cadência para inscrever negócios.</p>
        ) : !podeInscrever ? (
          <p className="text-sm text-muted-foreground">Seu papel não permite inscrever negócios.</p>
        ) : (
          <>
            <Input placeholder="Buscar negócio aberto pelo título…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <ul className="divide-y rounded-md border">
              {negocios.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">Nenhum negócio aberto com contato que tenha e-mail.</li>
              )}
              {negocios.map((n) => {
                const c = um(n.contacts)
                return (
                  <li key={n.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{n.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c?.name ?? "—"} · {c?.email}
                      </span>
                    </span>
                    <Button size="sm" disabled={inscrevendo === n.id} onClick={() => inscrever(n.id)}>
                      {inscrevendo === n.id && <Loader2 className="size-3.5 animate-spin" />} Inscrever
                    </Button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Negócio</th>
              <th className="p-2">Contato</th>
              <th className="p-2">Situação</th>
              <th className="p-2">E-mails</th>
              <th className="p-2">Aberturas</th>
              <th className="p-2">Próximo passo</th>
            </tr>
          </thead>
          <tbody>
            {lista === null && (
              <tr>
                <td colSpan={6} className="p-4 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {lista?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  Ninguém inscrito ainda.
                </td>
              </tr>
            )}
            {lista?.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-2">{um(i.deals)?.title ?? "—"}</td>
                <td className="p-2">{um(i.contacts)?.name ?? "—"}</td>
                <td className="p-2">
                  {i.status}
                  {i.motivo_parada ? ` (${i.motivo_parada})` : ""}
                </td>
                <td className="p-2">{i.emails_enviados}</td>
                <td className="p-2">{i.aberturas}</td>
                <td className="p-2">
                  {i.status === "ativa" ? new Date(i.proximo_em).toLocaleString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
