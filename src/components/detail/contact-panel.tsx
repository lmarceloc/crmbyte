"use client"

import { useCallback, useState } from "react"
import { Briefcase, Building2, Link2, Mail, MailMinus, MessageCircle, Phone, StickyNote, Tag, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/currency"
import { TemperatureBadge } from "@/components/pipelines/temperature-badge"
import type { DealTemperature } from "@/types"
import { useDetailPanel } from "./detail-panel-provider"
import { TelefoneWhatsapp } from "@/components/whatsapp-phone-link"
import { linkWhatsapp } from "@/lib/whatsapp-link"
import { NotaForm } from "./nota-form"
import { TextoComMencoes } from "./texto-com-mencoes"
import { useMembros } from "@/hooks/use-membros"
import { TarefasDoVinculo } from "@/components/tarefas/tarefas-do-vinculo"
import {
  Avatar,
  BarraSuperior,
  Cabecalho,
  Carregando,
  dataHora,
  Erro,
  type EventoDaLinha,
  Linha,
  LinhaDoTempo,
  linkSeguro,
  Metrica,
  relativa,
  ROTULO_RESULTADO,
  ROTULO_STATUS_NEGOCIO,
  Secao,
  situacaoInscricao,
  um,
  useCarregar,
  Vazio,
} from "./shared"

interface Contato {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  linkedin_url: string | null
  source: string | null
  email_unsubscribed_at: string | null
  company: { id: string; name: string } | { id: string; name: string }[] | null
  contact_tags: { tags: { name: string; color: string } | { name: string; color: string }[] | null }[] | null
}
interface NegocioDoContato {
  is_primary: boolean
  deals:
    | { id: string; title: string; status: string; value: number; currency: string | null; temperature: DealTemperature | null }
    | { id: string; title: string; status: string; value: number; currency: string | null; temperature: DealTemperature | null }[]
    | null
}
interface Nota {
  id: string
  note_text: string
  created_at: string
}
interface Inscricao {
  id: string
  status: string
  motivo_parada: string | null
  emails_enviados: number
  aberturas: number
  cliques: number
  resultado: string | null
  created_at: string
  email_cadences: { name: string } | { name: string }[] | null
  deals: { title: string } | { title: string }[] | null
}
interface Dados {
  contato: Contato
  negocios: NegocioDoContato[]
  notas: Nota[]
  inscricoes: Inscricao[]
  eventos: EventoDaLinha[]
}

export function ContactPanel({ id }: { id: string }) {
  const { push } = useDetailPanel()
  const [adicionando, setAdicionando] = useState(false)
  const [aba, setAba] = useState("detalhes")
  const membros = useMembros()

  const buscar = useCallback(async (): Promise<Dados> => {
    const db = createClient()
    const [c, d, n, i] = await Promise.all([
      db
        .from("contacts")
        .select(
          "id,name,email,phone,job_title,linkedin_url,source,email_unsubscribed_at,company:companies(id,name),contact_tags(tags(name,color))",
        )
        .eq("id", id)
        .maybeSingle(),
      db
        .from("deal_contacts")
        .select("is_primary,deals(id,title,status,value,currency,temperature)")
        .eq("contact_id", id),
      db.from("contact_notes").select("id,note_text,created_at").eq("contact_id", id).order("created_at", { ascending: false }),
      db
        .from("email_cadence_enrollments")
        .select("id,status,motivo_parada,emails_enviados,aberturas,cliques,resultado,created_at,email_cadences(name),deals(title)")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
    ])
    if (c.error) throw new Error(c.error.message)
    if (!c.data) throw new Error("Contato não encontrado ou sem acesso.")
    for (const r of [d, n, i]) if (r.error) throw new Error(r.error.message)

    const inscricoes = (i.data ?? []) as unknown as Inscricao[]
    let eventos: EventoDaLinha[] = []
    if (inscricoes.length > 0) {
      const ev = await db
        .from("email_cadence_events")
        .select("id,tipo,created_at,metadata,deals(title)")
        .in("enrollment_id", inscricoes.map((x) => x.id))
        .order("created_at", { ascending: false })
        .limit(100)
      if (ev.error) throw new Error(ev.error.message)
      eventos = (ev.data ?? []).map((e) => ({
        id: e.id as string,
        tipo: e.tipo as string,
        created_at: e.created_at as string,
        metadata: e.metadata as Record<string, unknown> | null,
        contexto: um(e.deals as { title: string } | { title: string }[] | null)?.title ?? null,
      }))
    }
    return {
      contato: c.data as unknown as Contato,
      negocios: (d.data ?? []) as unknown as NegocioDoContato[],
      notas: (n.data ?? []) as Nota[],
      inscricoes,
      eventos,
    }
  }, [id])

  const { dados, erro, carregando, recarregar } = useCarregar(buscar)

  if (carregando) return (<><BarraSuperior tipo="Contatos" /><Carregando /></>)
  if (erro || !dados) return (<><BarraSuperior tipo="Contatos" /><Erro mensagem={erro ?? "Falha ao carregar."} onRetry={recarregar} /></>)

  const { contato, negocios, notas, inscricoes, eventos } = dados
  const nome = contato.name || contato.phone || "Sem nome"
  const empresa = um(contato.company)
  const linkedin = linkSeguro(contato.linkedin_url)
  const tags = (contato.contact_tags ?? []).map((t) => um(t.tags)).filter((t): t is { name: string; color: string } => !!t)
  const enviados = inscricoes.reduce((s, x) => s + x.emails_enviados, 0)
  const aberturas = inscricoes.reduce((s, x) => s + x.aberturas, 0)
  const cliques = inscricoes.reduce((s, x) => s + x.cliques, 0)
  const resultado = inscricoes.find((x) => x.resultado)?.resultado ?? null

  return (
    <>
      <BarraSuperior tipo="Contatos" nome={nome} />
      <div className="flex-1 overflow-y-auto">
        <Cabecalho
          avatar={<Avatar nome={nome} redondo />}
          titulo={nome}
          subtitulo={
            <>
              {contato.job_title}
              {contato.job_title && empresa ? " · " : ""}
              {empresa && (
                <button type="button" className="text-primary hover:underline" onClick={() => push({ type: "company", id: empresa.id })}>
                  {empresa.name}
                </button>
              )}
            </>
          }
          acoes={
            <>
              {linkWhatsapp(contato.phone) && (
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={linkWhatsapp(contato.phone) ?? undefined} target="_blank" rel="noopener noreferrer" />}>
                  <MessageCircle /> Mensagem
                </Button>
              )}
              {contato.email && !contato.email_unsubscribed_at && (
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={`mailto:${contato.email}`} />}>
                  <Mail /> E-mail
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAba("notas")
                  setAdicionando(true)
                }}
              >
                <StickyNote /> Adicionar nota
              </Button>
            </>
          }
        />

        <Tabs value={aba} onValueChange={(v) => setAba(String(v))} className="gap-0">
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-x-1 gap-y-1 border-b px-3 py-1.5 group-data-horizontal/tabs:h-auto [&>[data-slot=tabs-trigger]]:h-8 [&>[data-slot=tabs-trigger]]:flex-none [&>[data-slot=tabs-trigger]]:px-3">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="negocios">Negócios ({negocios.length})</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
            <TabsTrigger value="notas">Notas ({notas.length})</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-6 p-5">
            <div className="space-y-3">
              <Linha icone={Mail} rotulo="E-mail">
                {contato.email}
                {contato.email_unsubscribed_at && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                    <MailMinus className="size-3" /> descadastrado
                  </span>
                )}
              </Linha>
              <Linha icone={Phone} rotulo="Telefone">{contato.phone?.trim() ? <TelefoneWhatsapp phone={contato.phone} /> : null}</Linha>
              <Linha icone={Link2} rotulo="LinkedIn">
                {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{contato.linkedin_url}</a>}
              </Linha>
              <Linha icone={Briefcase} rotulo="Cargo">{contato.job_title}</Linha>
              <Linha icone={Building2} rotulo="Empresa">
                {empresa && (
                  <button type="button" className="text-primary hover:underline" onClick={() => push({ type: "company", id: empresa.id })}>
                    {empresa.name}
                  </button>
                )}
              </Linha>
              <Linha icone={Tag} rotulo="Tags">
                {tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span key={t.name} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: t.color, color: t.color }}>
                        {t.name}
                      </span>
                    ))}
                  </span>
                )}
              </Linha>
              <Linha icone={UserRound} rotulo="Origem">{contato.source}</Linha>
            </div>
            <Secao titulo="Visão geral">
              <div className="grid grid-cols-2 gap-3">
                <Metrica titulo="E-mails enviados" valor={inscricoes.length ? enviados : "—"} />
                <Metrica titulo="Aberturas" valor={inscricoes.length ? aberturas : "—"} />
                <Metrica titulo="Cliques" valor={inscricoes.length ? cliques : "—"} />
                <Metrica titulo="Resultado" valor={resultado ? ROTULO_RESULTADO[resultado] : "—"} />
              </div>
            </Secao>
            {inscricoes.length > 0 && (
              <Secao titulo="Cadências">
                <ul className="divide-y rounded-lg border text-sm">
                  {inscricoes.map((x) => (
                    <li key={x.id} className="p-3">
                      <p className="font-medium">{um(x.email_cadences)?.name ?? "Cadência"}</p>
                      <p className="text-xs text-muted-foreground">
                        {um(x.deals)?.title} · {situacaoInscricao(x.status, x.motivo_parada)} · {x.emails_enviados} e-mails · {x.aberturas} aberturas · {x.cliques} cliques
                      </p>
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
          </TabsContent>

          <TabsContent value="negocios" className="p-5">
            {negocios.length === 0 ? (
              <Vazio>Este contato não está em nenhum negócio.</Vazio>
            ) : (
              <ul className="divide-y rounded-lg border">
                {negocios.map((nc) => {
                  const dl = um(nc.deals)
                  if (!dl) return null
                  return (
                    <li key={dl.id}>
                      <button type="button" onClick={() => push({ type: "deal", id: dl.id })} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {dl.title}
                            {nc.is_primary && <span className="ml-2 text-xs text-muted-foreground">(principal)</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {ROTULO_STATUS_NEGOCIO[dl.status] ?? dl.status} · {formatCurrency(dl.value, dl.currency ?? undefined)}
                          </span>
                        </span>
                        <TemperatureBadge value={dl.temperature} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="tarefas" className="p-5">
            <TarefasDoVinculo contatoId={id} ativo={aba === "tarefas"} />
          </TabsContent>

          <TabsContent value="notas" className="space-y-3 p-5">
            {adicionando ? (
              <NotaForm
                contactId={contato.id}
                onCancel={() => setAdicionando(false)}
                onAdded={() => {
                  setAdicionando(false)
                  void recarregar()
                }}
              />
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAdicionando(true)}>
                <StickyNote /> Adicionar nota
              </Button>
            )}
            {notas.length === 0 ? (
              <Vazio>Nenhuma nota ainda.</Vazio>
            ) : (
              <ul className="space-y-2">
                {notas.map((n) => (
                  <li key={n.id} className="rounded-lg border p-3 text-sm">
                    <p className="whitespace-pre-wrap break-words"><TextoComMencoes texto={n.note_text} membros={membros} /></p>
                    <p className="mt-1 text-xs text-muted-foreground" title={dataHora(n.created_at)}>{relativa(n.created_at)}</p>
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
