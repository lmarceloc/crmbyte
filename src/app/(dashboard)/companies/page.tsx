"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Building2, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { useDetailPanel } from "@/components/detail/detail-panel-provider"
import { useCan } from "@/hooks/use-can"
import { createClient } from "@/lib/supabase/client"
import { linkExterno, normalizarUrl, rotuloDeUrl } from "@/lib/url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Company } from "@/types"

interface Linha extends Company {
  contacts: { count: number }[]
  deals: { count: number }[]
}
interface ContatoMini {
  id: string
  name: string | null
  email: string | null
  job_title: string | null
}
interface NegocioMini {
  id: string
  title: string
  status: string | null
  pipeline_id: string
}

const STATUS: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" }

function LinkExterno({ url }: { url: string | null | undefined }) {
  const href = linkExterno(url)
  if (!href) return <span className="text-muted-foreground">—</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {rotuloDeUrl(href)}
    </a>
  )
}

export default function CompaniesPage() {
  const supabase = createClient()
  const { accountId, user } = useAuth()
  const { open: abrirPainel } = useDetailPanel()
  const podeEditar = useCan("send-messages")

  const [lista, setLista] = useState<Linha[] | null>(null)
  const [busca, setBusca] = useState("")
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<{ contatos: ContatoMini[]; negocios: NegocioMini[] } | null>(null)

  const [dialogo, setDialogo] = useState<{ aberto: boolean; empresa: Company | null }>({ aberto: false, empresa: null })
  const [nome, setNome] = useState("")
  const [site, setSite] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<Company | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("*, contacts(count), deals(count)")
      .order("name")
    if (error) {
      toast.error("Não foi possível carregar as empresas.")
      setLista([])
      return
    }
    setLista((data ?? []) as unknown as Linha[])
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  async function alternar(id: string) {
    if (aberta === id) return setAberta(null)
    setAberta(id)
    setDetalhe(null)
    const [c, d] = await Promise.all([
      supabase.from("contacts").select("id,name,email,job_title").eq("company_id", id).order("name"),
      supabase.from("deals").select("id,title,status,pipeline_id").eq("company_id", id).order("created_at", { ascending: false }),
    ])
    setDetalhe({ contatos: (c.data ?? []) as ContatoMini[], negocios: (d.data ?? []) as NegocioMini[] })
  }

  function abrirDialogo(empresa: Company | null) {
    setNome(empresa?.name ?? "")
    setSite(empresa?.website ?? "")
    setLinkedin(empresa?.linkedin_url ?? "")
    setDialogo({ aberto: true, empresa })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return toast.error("Informe o nome da empresa.")
    const website = normalizarUrl(site)
    const linkedinUrl = normalizarUrl(linkedin)
    if (site.trim() && !website) return toast.error("Site inválido: use um link http(s).")
    if (linkedin.trim() && !linkedinUrl) return toast.error("LinkedIn inválido: use um link http(s).")
    if (!accountId) return toast.error("Seu perfil não está vinculado a uma conta.")

    setSalvando(true)
    const campos = { name: nome.trim(), website, linkedin_url: linkedinUrl }
    const { error } = dialogo.empresa
      ? await supabase.from("companies").update(campos).eq("id", dialogo.empresa.id)
      : await supabase.from("companies").insert({ ...campos, account_id: accountId, user_id: user?.id ?? null })
    setSalvando(false)
    if (error) {
      return toast.error(error.code === "23505" ? "Já existe uma empresa com esse nome." : "Não foi possível salvar a empresa.")
    }
    toast.success(dialogo.empresa ? "Empresa atualizada" : "Empresa criada")
    setDialogo({ aberto: false, empresa: null })
    carregar()
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    const { error } = await supabase.from("companies").delete().eq("id", excluir.id)
    setExcluindo(false)
    if (error) return toast.error("Não foi possível excluir a empresa.")
    toast.success("Empresa excluída")
    setExcluir(null)
    if (aberta === excluir.id) setAberta(null)
    carregar()
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (lista ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [lista, busca])

  return (
    <div className="w-full space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Empresas</h1>
            <p className="text-sm text-muted-foreground">Empresa → negócios → contatos, tudo no mesmo lugar.</p>
          </div>
        </div>
        {podeEditar && (
          <Button onClick={() => abrirDialogo(null)}>
            <Plus className="size-4" /> Nova empresa
          </Button>
        )}
      </div>

      <Input placeholder="Buscar empresa pelo nome…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">Empresa</th>
              <th className="p-2">Site</th>
              <th className="p-2">LinkedIn</th>
              <th className="p-2 text-right">Contatos</th>
              <th className="p-2 text-right">Negócios</th>
              <th className="w-20 p-2" />
            </tr>
          </thead>
          <tbody>
            {lista === null && (
              <tr>
                <td colSpan={7} className="p-6 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {lista && filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {lista.length === 0 ? "Nenhuma empresa ainda." : "Nenhuma empresa encontrada."}
                </td>
              </tr>
            )}
            {filtradas.map((c) => (
              <Fragment key={c.id}>
                <tr className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">
                    <button
                      type="button"
                      aria-label={aberta === c.id ? "Recolher" : "Expandir"}
                      onClick={() => alternar(c.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {aberta === c.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </td>
                  <td className="p-2 font-medium whitespace-nowrap">
                    <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => abrirPainel({ type: "company", id: c.id })}>
                      {c.name}
                    </button>
                  </td>
                  <td className="p-2"><LinkExterno url={c.website} /></td>
                  <td className="p-2"><LinkExterno url={c.linkedin_url} /></td>
                  <td className="p-2 text-right">{c.contacts?.[0]?.count ?? 0}</td>
                  <td className="p-2 text-right">{c.deals?.[0]?.count ?? 0}</td>
                  <td className="p-2">
                    {podeEditar && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => abrirDialogo(c)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Excluir" onClick={() => setExcluir(c)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {aberta === c.id && (
                  <tr className="border-b bg-muted/20">
                    <td />
                    <td colSpan={6} className="p-3">
                      {!detalhe ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Negócios</h3>
                            {detalhe.negocios.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum negócio.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {detalhe.negocios.map((n) => (
                                  <li key={n.id}>
                                    <Link href="/pipelines" className="hover:text-primary hover:underline">
                                      {n.title}
                                    </Link>{" "}
                                    <span className="text-xs text-muted-foreground">{STATUS[n.status ?? ""] ?? n.status}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Contatos</h3>
                            {detalhe.contatos.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum contato.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {detalhe.contatos.map((p) => (
                                  <li key={p.id}>
                                    <Link href="/contacts" className="hover:text-primary hover:underline">
                                      {p.name || "Sem nome"}
                                    </Link>{" "}
                                    <span className="text-xs text-muted-foreground">
                                      {[p.job_title, p.email].filter(Boolean).join(" · ")}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogo.aberto} onOpenChange={(aberto) => !aberto && setDialogo({ aberto: false, empresa: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogo.empresa ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>Nome, site e LinkedIn da empresa.</DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-nome">Nome *</Label>
              <Input id="emp-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-site">Site</Label>
              <Input id="emp-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="empresa.com.br" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-linkedin">LinkedIn</Label>
              <Input id="emp-linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/company/empresa" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogo({ aberto: false, empresa: null })}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="size-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluir} onOpenChange={(aberto) => !aberto && setExcluir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir empresa?</DialogTitle>
            <DialogDescription>
              “{excluir?.name}” será removida. Contatos e negócios ligados a ela continuam existindo, só ficam sem empresa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={excluindo} onClick={confirmarExclusao}>
              {excluindo && <Loader2 className="size-4 animate-spin" />} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
