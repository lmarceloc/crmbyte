"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"
import { useDetailPanel } from "@/components/detail/detail-panel-provider"
import {
  ocupacaoEmOutraCadencia,
  resumoDeInscricao,
  rotuloDoInscrito,
  textoDaOcupacao,
  type InscricaoEmOutraCadencia,
} from "@/lib/cadencias/inscricao-do-negocio"
import { inscricoesAtivasEmOutras } from "@/lib/cadencias/ocupacao"

interface Inscricao {
  id: string
  deal_id: string
  contact_id: string
  status: string
  motivo_parada: string | null
  emails_enviados: number
  aberturas: number
  cliques: number
  resultado: "com_interesse" | "sem_interesse" | "agendado" | null
  proximo_em: string
  deals: { title: string } | { title: string }[] | null
  contacts: { name: string | null } | { name: string | null }[] | null
}
interface ContatoDoNegocio {
  contact_id: string
  contacts: ContatoInfo | ContatoInfo[] | null
}
interface ContatoInfo {
  name: string | null
  email: string | null
  email_unsubscribed_at: string | null
}
interface Negocio {
  id: string
  title: string
  company_id: string | null
  deal_contacts: ContatoDoNegocio[]
}

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export function AbaInscritos({ cadenciaId, ativa }: { cadenciaId: string; ativa: boolean }) {
  const podeInscrever = useCan("send-messages")
  const { open: abrirPainel } = useDetailPanel()
  const [lista, setLista] = useState<Inscricao[] | null>(null)
  const [busca, setBusca] = useState("")
  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [inscrevendo, setInscrevendo] = useState<string | null>(null)
  // status da inscrição nesta cadência, por "negócio:contato" (qualquer status impede inscrever de novo)
  const [inscritos, setInscritos] = useState<Record<string, string>>({})
  // inscrições ATIVAS em outras cadências que tocam os negócios listados (negócio, empresa ou contato)
  const [emOutras, setEmOutras] = useState<InscricaoEmOutraCadencia[]>([])

  const carregarInscritos = useCallback(
    async (lista: Negocio[]) => {
      if (lista.length === 0) {
        setInscritos({})
        setEmOutras([])
        return
      }
      const db = createClient()
      const idsDosNegocios = lista.map((n) => n.id)
      const [{ data }, outras] = await Promise.all([
        db
          .from("email_cadence_enrollments")
          .select("deal_id,contact_id,status")
          .eq("cadence_id", cadenciaId)
          .in("deal_id", idsDosNegocios),
        inscricoesAtivasEmOutras(db, cadenciaId, {
          dealIds: idsDosNegocios,
          contactIds: [...new Set(lista.flatMap((n) => n.deal_contacts.map((d) => d.contact_id)))],
          companyIds: [...new Set(lista.map((n) => n.company_id).filter((c): c is string => !!c))],
        }).catch(() => [] as InscricaoEmOutraCadencia[]),
      ])
      setInscritos(
        Object.fromEntries((data ?? []).map((r) => [`${r.deal_id}:${r.contact_id}`, r.status as string])),
      )
      setEmOutras(outras)
    },
    [cadenciaId],
  )

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
        .select("id,title,company_id,deal_contacts(contact_id,contacts(name,email,email_unsubscribed_at))")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20)
      if (busca.trim()) q = q.ilike("title", `%${busca.trim()}%`)
      const { data } = await q
      const achados = (data ?? []) as unknown as Negocio[]
      setNegocios(achados)
      await carregarInscritos(achados)
    }, 300)
    return () => clearTimeout(t)
  }, [busca, ativa, podeInscrever, carregarInscritos])

  async function marcarResultado(inscricaoId: string, valor: string) {
    const resultado = valor === "" ? null : valor
    const res = await fetch(`/api/cadencias/${cadenciaId}/inscricoes/${inscricaoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultado }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(body?.error ?? "Falha ao marcar o resultado.")
    if (resultado === "sem_interesse" || resultado === "agendado")
      toast.success("Resultado marcado — a sequência deste lead foi encerrada.")
    else toast.success("Resultado atualizado")
    carregar()
  }

  async function inscrever(dealId: string, contactId?: string) {
    const chave = contactId ?? dealId
    setInscrevendo(chave)
    const res = await fetch(`/api/cadencias/${cadenciaId}/inscricoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deal_id: dealId, ...(contactId ? { contact_id: contactId } : {}) }),
    })
    const body = await res.json().catch(() => ({}))
    setInscrevendo(null)
    // atualiza também no erro: um 409 "já estão nesta cadência" significa que a tela estava defasada
    void carregarInscritos(negocios)
    if (!res.ok) return toast.error(body?.error ?? "Falha ao inscrever.")
    toast.success(`${body.inscritos ?? 1} contato(s) inscrito(s)`)
    carregar()
  }

  return (
    <div className="w-full space-y-6">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h3 className="font-medium">Inscrever contatos de um negócio</h3>
        {!ativa ? (
          <p className="text-sm text-muted-foreground">Ative a cadência para inscrever negócios.</p>
        ) : !podeInscrever ? (
          <p className="text-sm text-muted-foreground">Seu papel não permite inscrever negócios.</p>
        ) : (
          <>
            <Input placeholder="Buscar negócio aberto pelo título…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <ul className="divide-y rounded-md border">
              {negocios.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum negócio aberto encontrado.</li>}
              {negocios.map((n) => {
                const contatos = n.deal_contacts.map((d) => ({ id: d.contact_id, c: um(d.contacts) }))
                const elegiveis = contatos.filter((x) => x.c?.email?.trim() && !x.c.email_unsubscribed_at)
                const { pendentes, rotuloQuandoInscrito } = resumoDeInscricao(
                  elegiveis.map((x) => x.id),
                  (contatoId) => inscritos[`${n.id}:${contatoId}`],
                )
                // um lead fica numa cadência por vez (a API também recusa)
                const ocupacao = rotuloQuandoInscrito
                  ? null
                  : ocupacaoEmOutraCadencia(
                      { id: n.id, company_id: n.company_id, contatos: elegiveis.map((x) => x.id) },
                      emOutras,
                    )
                return (
                  <li key={n.id} className="space-y-1.5 p-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{n.title}</span>
                      {rotuloQuandoInscrito ? (
                        <Button size="sm" variant="secondary" disabled>
                          {rotuloQuandoInscrito}
                        </Button>
                      ) : ocupacao ? (
                        <Button size="sm" variant="secondary" disabled title={textoDaOcupacao(ocupacao)}>
                          Em outra cadência
                        </Button>
                      ) : (
                        <Button size="sm" disabled={pendentes === 0 || inscrevendo === n.id} onClick={() => inscrever(n.id)}>
                          {inscrevendo === n.id && <Loader2 className="size-3.5 animate-spin" />} Inscrever
                          {pendentes > 0 ? ` (${pendentes})` : ""}
                        </Button>
                      )}
                    </div>
                    {ocupacao && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">{textoDaOcupacao(ocupacao)}</p>
                    )}
                    {contatos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem contatos — adicione um contato ao negócio.</p>
                    ) : (
                      <ul className="space-y-0.5 pl-2">
                        {contatos.map(({ id, c }) => {
                          const ok = !!c?.email?.trim() && !c.email_unsubscribed_at
                          const statusInscricao = inscritos[`${n.id}:${id}`]
                          return (
                            <li key={id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">
                                {c?.name ?? "—"} · {c?.email || "sem e-mail"}
                                {c?.email_unsubscribed_at ? " · descadastrado" : ""}
                              </span>
                              {ok && statusInscricao && (
                                <span className="shrink-0">{rotuloDoInscrito(statusInscricao)}</span>
                              )}
                              {ok && !statusInscricao && !ocupacao && (
                                <button
                                  className="shrink-0 text-primary hover:underline disabled:opacity-50"
                                  disabled={inscrevendo === id}
                                  onClick={() => inscrever(n.id, id)}
                                >
                                  só este
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs whitespace-nowrap text-muted-foreground">
            <tr>
              <th className="p-2">Negócio</th>
              <th className="p-2">Contato</th>
              <th className="p-2">Situação</th>
              <th className="p-2">E-mails</th>
              <th className="p-2">Aberturas</th>
              <th className="p-2">Cliques</th>
              <th className="p-2">Resultado</th>
              <th className="p-2">Próximo passo</th>
            </tr>
          </thead>
          <tbody>
            {lista === null && (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {lista?.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Ninguém inscrito ainda.
                </td>
              </tr>
            )}
            {lista?.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-2">
                  <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => abrirPainel({ type: "deal", id: i.deal_id })}>
                    {um(i.deals)?.title ?? "—"}
                  </button>
                </td>
                <td className="p-2">
                  <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => abrirPainel({ type: "contact", id: i.contact_id })}>
                    {um(i.contacts)?.name ?? "—"}
                  </button>
                </td>
                <td className="p-2">
                  {i.status}
                  {i.motivo_parada ? ` (${i.motivo_parada})` : ""}
                </td>
                <td className="p-2">{i.emails_enviados}</td>
                <td className="p-2">{i.aberturas}</td>
                <td className="p-2">{i.cliques}</td>
                <td className="p-2">
                  <select
                    className="h-7 rounded-md border bg-background px-1.5 text-xs"
                    value={i.resultado ?? ""}
                    disabled={!podeInscrever}
                    onChange={(e) => marcarResultado(i.id, e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="com_interesse">Com interesse</option>
                    <option value="sem_interesse">Sem interesse</option>
                    <option value="agendado">Agendado</option>
                  </select>
                </td>
                <td className="p-2 whitespace-nowrap">
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
