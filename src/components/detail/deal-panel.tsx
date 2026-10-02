"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { Building2, Calendar, Pencil, CircleDollarSign, FileText, Flag, Layers, Link2, Mail, MessageCircle, StickyNote, Tag, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/currency"
import { formatMoeda } from "@/lib/money"
import { TemperaturePicker } from "@/components/pipelines/temperature-badge"
import type { DealTemperature } from "@/types"
import { useDetailPanel } from "./detail-panel-provider"
import { TelefoneWhatsapp } from "@/components/whatsapp-phone-link"
import { linkWhatsapp } from "@/lib/whatsapp-link"
import { NotaForm } from "./nota-form"
import {
  Avatar,
  BarraSuperior,
  Cabecalho,
  Carregando,
  dataCurta,
  Erro,
  type EventoDaLinha,
  Linha,
  LinhaDoTempo,
  linkSeguro,
  Metrica,
  ROTULO_RESULTADO,
  ROTULO_STATUS_NEGOCIO,
  Secao,
  situacaoInscricao,
  um,
  useCarregar,
  Vazio,
} from "./shared"

interface Negocio {
  id: string
  title: string
  value: number
  currency: string | null
  status: string
  notes: string | null
  expected_close_date: string | null
  linkedin_url: string | null
  temperature: DealTemperature | null
  source: string | null
  assigned_to: string | null
  company: { id: string; name: string } | { id: string; name: string }[] | null
  stage: { name: string; color: string } | { name: string; color: string }[] | null
  pipeline: { name: string } | { name: string }[] | null
}
interface ContatoDoNegocio {
  is_primary: boolean
  contacts:
    | { id: string; name: string | null; email: string | null; phone: string | null; job_title: string | null }
    | { id: string; name: string | null; email: string | null; phone: string | null; job_title: string | null }[]
    | null
}
interface Inscricao {
  id: string
  status: string
  motivo_parada: string | null
  emails_enviados: number
  aberturas: number
  cliques: number
  resultado: string | null
  email_cadences: { name: string } | { name: string }[] | null
  contacts: { name: string | null } | { name: string | null }[] | null
}
interface ItemDoNegocio {
  id: string
  name: string
  unit_price: number
  quantity: number
}
interface NotaDoNegocio {
  id: string
  note_text: string
  created_at: string
  contacts: { name: string | null } | { name: string | null }[] | null
}
interface Dados {
  notas: NotaDoNegocio[]
  produtos: ItemDoNegocio[]
  negocio: Negocio
  responsavel: string | null
  contatos: ContatoDoNegocio[]
  inscricoes: Inscricao[]
  eventos: EventoDaLinha[]
}

export function DealPanel({ id }: { id: string }) {
  const { push, close } = useDetailPanel()
  const [aba, setAba] = useState("detalhes")
  const [nota, setNota] = useState(false)
  const [temperatura, setTemperatura] = useState<DealTemperature | null>(null)

  const buscar = useCallback(async (): Promise<Dados> => {
    const db = createClient()
    const [d, c, i, ev, pr] = await Promise.all([
      db
        .from("deals")
        .select(
          "id,title,value,currency,status,notes,expected_close_date,linkedin_url,temperature,source,assigned_to,company:companies(id,name),stage:pipeline_stages(name,color),pipeline:pipelines(name)",
        )
        .eq("id", id)
        .maybeSingle(),
      db.from("deal_contacts").select("is_primary,contacts(id,name,email,phone,job_title)").eq("deal_id", id).order("is_primary", { ascending: false }),
      db
        .from("email_cadence_enrollments")
        .select("id,status,motivo_parada,emails_enviados,aberturas,cliques,resultado,email_cadences(name),contacts(name)")
        .eq("deal_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("email_cadence_events")
        .select("id,tipo,created_at,metadata,email_cadence_enrollments(contacts(name))")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("deal_products").select("id,name,unit_price,quantity").eq("deal_id", id).order("created_at"),
    ])
    if (d.error) throw new Error(d.error.message)
    if (!d.data) throw new Error("Negócio não encontrado ou sem acesso.")
    for (const r of [c, i, ev, pr]) if (r.error) throw new Error(r.error.message)

    // notas de TODOS os contatos do negócio (a nota nova vai para o principal)
    const idsContatos = ((c.data ?? []) as unknown as ContatoDoNegocio[])
      .map((x) => um(x.contacts)?.id)
      .filter((x): x is string => !!x)
    const notasRes = idsContatos.length
      ? await db
          .from("contact_notes")
          .select("id,note_text,created_at,contacts(name)")
          .in("contact_id", idsContatos)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null }
    if (notasRes.error) throw new Error(notasRes.error.message)

    let responsavel: string | null = null
    if (d.data.assigned_to) {
      const p = await db.from("profiles").select("full_name").eq("id", d.data.assigned_to).maybeSingle()
      responsavel = p.data?.full_name ?? null
    }
    const eventos: EventoDaLinha[] = (ev.data ?? []).map((e) => {
      const en = um(
        e.email_cadence_enrollments as
          | { contacts: { name: string | null } | { name: string | null }[] | null }
          | { contacts: { name: string | null } | { name: string | null }[] | null }[]
          | null,
      )
      return {
        id: e.id as string,
        tipo: e.tipo as string,
        created_at: e.created_at as string,
        metadata: e.metadata as Record<string, unknown> | null,
        contexto: um(en?.contacts ?? null)?.name ?? null,
      }
    })
    return {
      notas: (notasRes.data ?? []) as unknown as NotaDoNegocio[],
      produtos: ((pr.data ?? []) as ItemDoNegocio[]).map((x) => ({
        ...x,
        unit_price: Number(x.unit_price),
        quantity: Number(x.quantity),
      })),
      negocio: d.data as unknown as Negocio,
      responsavel,
      contatos: (c.data ?? []) as unknown as ContatoDoNegocio[],
      inscricoes: (i.data ?? []) as unknown as Inscricao[],
      eventos,
    }
  }, [id])

  const { dados, erro, carregando, recarregar } = useCarregar(buscar)

  async function mudarTemperatura(nova: DealTemperature, atual: DealTemperature) {
    setTemperatura(nova) // otimista
    const { error } = await createClient().from("deals").update({ temperature: nova }).eq("id", id)
    if (error) {
      setTemperatura(atual)
      return toast.error(`Não foi possível mudar a temperatura: ${error.message}`)
    }
    toast.success("Temperatura atualizada")
  }

  if (carregando) return (<><BarraSuperior tipo="Negócios" /><Carregando /></>)
  if (erro || !dados) return (<><BarraSuperior tipo="Negócios" /><Erro mensagem={erro ?? "Falha ao carregar."} onRetry={recarregar} /></>)

  const { negocio, responsavel, contatos, inscricoes, eventos, produtos, notas } = dados
  const moeda = negocio.currency || "BRL"
  const totalProdutos = produtos.reduce((t, x) => t + x.unit_price * x.quantity, 0)
  const empresa = um(negocio.company)
  const etapa = um(negocio.stage)
  const funil = um(negocio.pipeline)
  const linkedin = linkSeguro(negocio.linkedin_url)
  const principal = um(contatos.find((c) => c.is_primary)?.contacts ?? contatos[0]?.contacts ?? null)
  const temp = temperatura ?? negocio.temperature ?? "frio"
  const enviados = inscricoes.reduce((s, x) => s + x.emails_enviados, 0)
  const aberturas = inscricoes.reduce((s, x) => s + x.aberturas, 0)
  const cliques = inscricoes.reduce((s, x) => s + x.cliques, 0)

  return (
    <>
      <BarraSuperior tipo="Negócios" nome={negocio.title} />
      <div className="flex-1 overflow-y-auto">
        <Cabecalho
          avatar={<Avatar nome={negocio.title} />}
          titulo={negocio.title}
          subtitulo={
            <>
              {empresa && (
                <button type="button" className="text-primary hover:underline" onClick={() => push({ type: "company", id: empresa.id })}>
                  {empresa.name}
                </button>
              )}
              {empresa && linkedin ? " · " : ""}
              {linkedin && (
                <a href={linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  LinkedIn
                </a>
              )}
            </>
          }
          acoes={
            <>
              {linkWhatsapp(principal?.phone) && (
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={linkWhatsapp(principal?.phone) ?? undefined} target="_blank" rel="noopener noreferrer" />}>
                  <MessageCircle /> Mensagem
                </Button>
              )}
              {principal?.email && (
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={`mailto:${principal.email}`} />}>
                  <Mail /> E-mail
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("deal:editar", { detail: { id } }))
                  close()
                }}
                title="Abre o formulário de edição no funil"
              >
                <Pencil /> Editar
              </Button>
              {principal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAba("notas")
                    setNota(true)
                  }}
                >
                  <StickyNote /> Adicionar nota
                </Button>
              )}
            </>
          }
        />

        <div className="space-y-2 border-b px-5 py-4">
          <p className="text-xs text-muted-foreground">Temperatura</p>
          <TemperaturePicker value={temp} onChange={(v) => mudarTemperatura(v, temp)} />
        </div>

        <Tabs value={aba} onValueChange={(v) => setAba(String(v))} className="gap-0">
          <TabsList variant="line" className="h-10 w-full justify-start overflow-x-auto border-b px-3">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="contatos">Contatos ({contatos.length})</TabsTrigger>
            <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
            <TabsTrigger value="notas">Notas ({notas.length})</TabsTrigger>
            <TabsTrigger value="cadencias">Cadências ({inscricoes.length})</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-6 p-5">
            <div className="space-y-3">
              <Linha icone={CircleDollarSign} rotulo="Valor">{formatCurrency(negocio.value, negocio.currency ?? undefined)}</Linha>
              <Linha icone={Layers} rotulo="Funil / etapa">
                {[funil?.name, etapa?.name].filter(Boolean).join(" / ")}
              </Linha>
              <Linha icone={Flag} rotulo="Status">{ROTULO_STATUS_NEGOCIO[negocio.status] ?? negocio.status}</Linha>
              <Linha icone={Calendar} rotulo="Previsão de fechamento">{negocio.expected_close_date ? dataCurta(negocio.expected_close_date) : null}</Linha>
              <Linha icone={UserRound} rotulo="Responsável">{responsavel}</Linha>
              <Linha icone={Building2} rotulo="Empresa">
                {empresa && (
                  <button type="button" className="text-primary hover:underline" onClick={() => push({ type: "company", id: empresa.id })}>
                    {empresa.name}
                  </button>
                )}
              </Linha>
              <Linha icone={Link2} rotulo="LinkedIn">
                {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{negocio.linkedin_url}</a>}
              </Linha>
              <Linha icone={Tag} rotulo="Origem">{negocio.source}</Linha>
              <Linha icone={FileText} rotulo="Notas do negócio">
                {negocio.notes && <span className="whitespace-pre-wrap">{negocio.notes}</span>}
              </Linha>
            </div>
            <Secao titulo="Visão geral">
              <div className="grid grid-cols-2 gap-3">
                <Metrica titulo="E-mails enviados" valor={inscricoes.length ? enviados : "—"} />
                <Metrica
                  titulo="Taxa de abertura"
                  valor={enviados > 0 ? `${Math.round((inscricoes.filter((x) => x.aberturas > 0).length / Math.max(1, inscricoes.filter((x) => x.emails_enviados > 0).length)) * 100)}%` : "—"}
                  detalhe={enviados > 0 ? `${aberturas} aberturas` : undefined}
                />
                <Metrica titulo="Cliques" valor={inscricoes.length ? cliques : "—"} />
                <Metrica titulo="Contatos" valor={contatos.length} />
              </div>
            </Secao>
          </TabsContent>

          <TabsContent value="notas" className="space-y-3 p-5">
            {nota && principal ? (
              <NotaForm
                contactId={principal.id}
                onCancel={() => setNota(false)}
                onAdded={() => {
                  setNota(false)
                  void recarregar()
                }}
              />
            ) : principal ? (
              <Button size="sm" variant="outline" onClick={() => setNota(true)}>
                <StickyNote /> Adicionar nota
              </Button>
            ) : (
              <Vazio>Adicione um contato ao negócio para registrar notas.</Vazio>
            )}
            {principal && nota && (
              <p className="text-xs text-muted-foreground">A nota será registrada em {principal.name ?? "contato principal"}.</p>
            )}
            {notas.length === 0 ? (
              <Vazio>Nenhuma nota ainda.</Vazio>
            ) : (
              <ul className="space-y-2">
                {notas.map((n) => (
                  <li key={n.id} className="rounded-lg border p-3 text-sm">
                    <p className="whitespace-pre-wrap break-words">{n.note_text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {um(n.contacts)?.name ?? "Contato"} · {dataCurta(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="contatos" className="p-5">
            {contatos.length === 0 ? (
              <Vazio>Nenhum contato neste negócio. Adicione contatos ao editar o negócio.</Vazio>
            ) : (
              <ul className="divide-y rounded-lg border">
                {contatos.map((dc) => {
                  const c = um(dc.contacts)
                  if (!c) return null
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => push({ type: "contact", id: c.id })} className="w-full p-3 text-left hover:bg-muted/50">
                        <p className="text-sm font-medium">
                          {c.name || c.phone || "Sem nome"}
                          {dc.is_primary && (
                            <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Principal</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{[c.job_title, c.email].filter(Boolean).join(" · ") || "—"}</p>
                      </button>
                      {linkWhatsapp(c.phone) && (
                        <div className="px-3 pb-3 text-xs">
                          <TelefoneWhatsapp phone={c.phone} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="produtos" className="p-5">
            {produtos.length === 0 ? (
              <Vazio>Nenhum produto neste negócio. Adicione produtos ao editar o negócio; o valor passa a ser a soma deles.</Vazio>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Produto</th>
                      <th className="p-2 text-right">Qtd</th>
                      <th className="p-2 text-right">Unitário</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((x) => (
                      <tr key={x.id} className="border-b last:border-0">
                        <td className="p-2">{x.name}</td>
                        <td className="p-2 text-right tabular-nums">{x.quantity}</td>
                        <td className="p-2 text-right tabular-nums">{formatMoeda(x.unit_price, moeda)}</td>
                        <td className="p-2 text-right tabular-nums">{formatMoeda(x.unit_price * x.quantity, moeda)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-semibold">
                      <td className="p-2" colSpan={3}>Total</td>
                      <td className="p-2 text-right tabular-nums">{formatMoeda(totalProdutos, moeda)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cadencias" className="p-5">
            {inscricoes.length === 0 ? (
              <Vazio>Nenhum contato deste negócio foi inscrito em uma cadência.</Vazio>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {inscricoes.map((x) => (
                  <li key={x.id} className="space-y-0.5 p-3">
                    <p className="font-medium">{um(x.email_cadences)?.name ?? "Cadência"} · {um(x.contacts)?.name ?? "Contato"}</p>
                    <p className="text-xs text-muted-foreground">
                      {situacaoInscricao(x.status, x.motivo_parada)} · {x.emails_enviados} e-mails · {x.aberturas} aberturas · {x.cliques} cliques
                      {x.resultado ? ` · ${ROTULO_RESULTADO[x.resultado]}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="atividades" className="p-5">
            <LinhaDoTempo eventos={eventos} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
