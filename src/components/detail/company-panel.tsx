"use client"

import { TelefoneWhatsapp } from "@/components/whatsapp-phone-link"
import { linkWhatsapp } from "@/lib/whatsapp-link"
import { useCallback, useState } from "react"
import { Building2, Calendar, Globe, Layers, Link2, Mail, Plus, UserPlus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContatosDoNegocio } from "@/components/companies/contatos-do-negocio"
import { NovoContatoForm } from "@/components/companies/novo-contato-form"
import { NovoNegocioForm } from "@/components/companies/novo-negocio-form"
import { useCan } from "@/hooks/use-can"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/currency"
import { TemperatureBadge } from "@/components/pipelines/temperature-badge"
import type { DealTemperature } from "@/types"
import { useDetailPanel } from "./detail-panel-provider"
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
  ROTULO_STATUS_NEGOCIO,
  Secao,
  um,
  useCarregar,
  Vazio,
} from "./shared"

interface Empresa {
  id: string
  name: string
  website: string | null
  linkedin_url: string | null
  created_at: string
}
interface ContatoLinha {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
}
interface NegocioLinha {
  id: string
  title: string
  status: string
  value: number
  currency: string | null
  temperature: DealTemperature | null
  stage: { name: string } | { name: string }[] | null
  /** Agregado do PostgREST: `[{ count }]` com os contatos do negócio. */
  deal_contacts: { count: number }[] | null
}
interface Dados {
  empresa: Empresa
  contatos: ContatoLinha[]
  negocios: NegocioLinha[]
  eventos: EventoDaLinha[]
  totais: { enviados: number; aberturas: number }
}

export function CompanyPanel({ id }: { id: string }) {
  const { push } = useDetailPanel()
  const podeEditar = useCan("send-messages")
  // Empresa → negócio → contato, tudo na aba Negócios: o formulário do negócio novo
  // e a lista de contatos de UM negócio (o que acabou de nascer abre sozinho).
  const [novoAberto, setNovoAberto] = useState(false)
  const [contatosDe, setContatosDe] = useState<{ id: string; title: string } | null>(null)
  // Aba Contatos: criar ou vincular um contato da empresa sem sair do painel.
  const [novoContatoAberto, setNovoContatoAberto] = useState(false)

  const buscar = useCallback(async (): Promise<Dados> => {
    const db = createClient()
    const [emp, cont, neg] = await Promise.all([
      db.from("companies").select("id,name,website,linkedin_url,created_at").eq("id", id).maybeSingle(),
      db.from("contacts").select("id,name,email,phone,job_title").eq("company_id", id).order("name"),
      db
        .from("deals")
        .select("id,title,status,value,currency,temperature,stage:pipeline_stages(name),deal_contacts(count)")
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
    ])
    if (emp.error) throw new Error(emp.error.message)
    if (!emp.data) throw new Error("Empresa não encontrada ou sem acesso.")
    if (cont.error) throw new Error(cont.error.message)
    if (neg.error) throw new Error(neg.error.message)

    const negocios = (neg.data ?? []) as unknown as NegocioLinha[]
    const ids = negocios.map((n) => n.id)
    let eventos: EventoDaLinha[] = []
    const totais = { enviados: 0, aberturas: 0 }
    if (ids.length > 0) {
      const [ev, ins] = await Promise.all([
        db
          .from("email_cadence_events")
          .select("id,tipo,created_at,metadata,deals(title),email_cadence_enrollments(contacts(name))")
          .in("deal_id", ids)
          .order("created_at", { ascending: false })
          .limit(50),
        db.from("email_cadence_enrollments").select("emails_enviados,aberturas").in("deal_id", ids),
      ])
      if (ev.error) throw new Error(ev.error.message)
      eventos = (ev.data ?? []).map((e) => {
        const d = um(e.deals as { title: string } | { title: string }[] | null)
        const en = um(
          e.email_cadence_enrollments as
            | { contacts: { name: string | null } | { name: string | null }[] | null }
            | { contacts: { name: string | null } | { name: string | null }[] | null }[]
            | null,
        )
        const c = um(en?.contacts ?? null)
        return {
          id: e.id as string,
          tipo: e.tipo as string,
          created_at: e.created_at as string,
          metadata: e.metadata as Record<string, unknown> | null,
          contexto: [c?.name, d?.title].filter(Boolean).join(" · ") || null,
        }
      })
      for (const i of ins.data ?? []) {
        totais.enviados += i.emails_enviados ?? 0
        totais.aberturas += i.aberturas ?? 0
      }
    }
    return { empresa: emp.data as Empresa, contatos: (cont.data ?? []) as ContatoLinha[], negocios, eventos, totais }
  }, [id])

  const { dados, erro, carregando, recarregar } = useCarregar(buscar)

  if (carregando) return (<><BarraSuperior tipo="Empresas" /><Carregando /></>)
  if (erro || !dados) return (<><BarraSuperior tipo="Empresas" /><Erro mensagem={erro ?? "Falha ao carregar."} onRetry={recarregar} /></>)

  const { empresa, contatos, negocios, eventos, totais } = dados
  const site = linkSeguro(empresa.website)
  const linkedin = linkSeguro(empresa.linkedin_url)
  const comEmail = contatos.find((c) => c.email?.trim())

  return (
    <>
      <BarraSuperior tipo="Empresas" nome={empresa.name} />
      <div className="flex-1 overflow-y-auto">
        <Cabecalho
          avatar={<Avatar nome={empresa.name} />}
          titulo={empresa.name}
          subtitulo={
            site ? (
              <a href={site} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : undefined
          }
          acoes={
            comEmail && (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`mailto:${comEmail.email}`} />}>
                <Mail /> E-mail
              </Button>
            )
          }
        />

        <Tabs defaultValue="detalhes" className="gap-0">
          <TabsList variant="line" className="h-10 w-full justify-start overflow-x-auto border-b px-3">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="contatos">Contatos ({contatos.length})</TabsTrigger>
            <TabsTrigger value="negocios">Negócios ({negocios.length})</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-6 p-5">
            <div className="space-y-3">
              <Linha icone={Building2} rotulo="Nome">{empresa.name}</Linha>
              <Linha icone={Globe} rotulo="Site">
                {site && <a href={site} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{empresa.website}</a>}
              </Linha>
              <Linha icone={Link2} rotulo="LinkedIn">
                {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{empresa.linkedin_url}</a>}
              </Linha>
              <Linha icone={Users} rotulo="Contatos">{String(contatos.length)}</Linha>
              <Linha icone={Layers} rotulo="Negócios">{String(negocios.length)}</Linha>
              <Linha icone={Calendar} rotulo="Criada em">{dataCurta(empresa.created_at)}</Linha>
            </div>
            <Secao titulo="Visão geral">
              <div className="grid grid-cols-2 gap-3">
                <Metrica titulo="Contatos" valor={contatos.length} />
                <Metrica titulo="Negócios" valor={negocios.length} detalhe={`${negocios.filter((n) => n.status === "open").length} em aberto`} />
                <Metrica titulo="E-mails enviados" valor={negocios.length ? totais.enviados : "—"} />
                <Metrica titulo="Aberturas" valor={negocios.length ? totais.aberturas : "—"} />
              </div>
            </Secao>
          </TabsContent>

          <TabsContent value="contatos" className="space-y-3 p-5">
            {podeEditar && !novoContatoAberto && (
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => setNovoContatoAberto(true)}>
                  <Plus /> Novo contato
                </Button>
              </div>
            )}
            {novoContatoAberto && (
              <NovoContatoForm
                empresa={{ id: empresa.id, name: empresa.name }}
                onCancelar={() => setNovoContatoAberto(false)}
                onFeito={() => {
                  setNovoContatoAberto(false)
                  void recarregar()
                }}
              />
            )}
            {contatos.length === 0 ? (
              !novoContatoAberto && <Vazio>Nenhum contato vinculado a esta empresa.</Vazio>
            ) : (
              <ul className="divide-y rounded-lg border">
                {contatos.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => push({ type: "contact", id: c.id })} className="w-full p-3 text-left hover:bg-muted/50">
                      <p className="text-sm font-medium">{c.name || c.phone || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{[c.job_title, c.email].filter(Boolean).join(" · ") || "—"}</p>
                    </button>
                    {linkWhatsapp(c.phone) && (
                      <div className="px-3 pb-3 text-xs">
                        <TelefoneWhatsapp phone={c.phone} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="negocios" className="space-y-3 p-5">
            {podeEditar && !novoAberto && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setContatosDe(null)
                    setNovoAberto(true)
                  }}
                >
                  <Plus /> Novo negócio
                </Button>
              </div>
            )}
            {novoAberto && (
              <NovoNegocioForm
                empresa={{ id: empresa.id, name: empresa.name }}
                onCancelar={() => setNovoAberto(false)}
                onCriado={(novo) => {
                  setNovoAberto(false)
                  setContatosDe(novo)
                  void recarregar()
                }}
              />
            )}
            {negocios.length === 0 ? (
              !novoAberto && <Vazio>Nenhum negócio desta empresa.</Vazio>
            ) : (
              <ul className="divide-y rounded-lg border">
                {negocios.map((n) => {
                  const nContatos = n.deal_contacts?.[0]?.count ?? 0
                  return (
                    <li key={n.id}>
                      <div className="flex items-center">
                        <button type="button" onClick={() => push({ type: "deal", id: n.id })} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-muted/50">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{n.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {ROTULO_STATUS_NEGOCIO[n.status] ?? n.status} · {um(n.stage)?.name ?? "—"} · {formatCurrency(n.value, n.currency ?? undefined)} · {nContatos} {nContatos === 1 ? "contato" : "contatos"}
                            </span>
                          </span>
                          <TemperatureBadge value={n.temperature} />
                        </button>
                        {podeEditar && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="mr-2 size-8 shrink-0"
                            aria-label={`Contatos de ${n.title}`}
                            title="Contatos do negócio"
                            onClick={() => setContatosDe(contatosDe?.id === n.id ? null : { id: n.id, title: n.title })}
                          >
                            <UserPlus className="size-4" />
                          </Button>
                        )}
                      </div>
                      {contatosDe?.id === n.id && (
                        <div className="border-t p-3">
                          <ContatosDoNegocio
                            key={n.id}
                            empresa={{ id: empresa.id, name: empresa.name }}
                            negocio={{ id: n.id, title: n.title }}
                            onMudou={() => void recarregar()}
                            onFechar={() => setContatosDe(null)}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
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
