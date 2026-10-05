"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, Info, Loader2, Sparkles, TriangleAlert } from "lucide-react"

import { RequireRole } from "@/components/auth/require-role"
import { SkillsDialog, type Skill } from "@/components/ia/skills-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LIMITE_SKILLS } from "@/lib/ia/prompt"
import { createClient } from "@/lib/supabase/client"

interface Resultado {
  assunto: string
  corpo: string
  aviso: string | null
}

function PaginaIa() {
  const supabase = createClient()
  const [nomeDoLead, setNomeDoLead] = useState("")
  const [cargo, setCargo] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [empresa, setEmpresa] = useState("")
  const [site, setSite] = useState("")

  const [skills, setSkills] = useState<Skill[]>([])
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [skillsAberto, setSkillsAberto] = useState(false)

  // null = ainda carregando; false = falta o nome da empresa ou os serviços que ela oferece (Configurações → IA)
  const [perfilOk, setPerfilOk] = useState<boolean | null>(null)

  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const carregarSkills = useCallback(async () => {
    const { data, error } = await supabase.from("ai_skills").select("id,name,description,content").order("name")
    if (error) {
      toast.error("Não foi possível carregar as skills.")
      return
    }
    const lista = (data ?? []) as Skill[]
    setSkills(lista)
    setSelecionadas((atual) => atual.filter((id) => lista.some((s) => s.id === id)))
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => void carregarSkills(), 0)
    return () => clearTimeout(t)
  }, [carregarSkills])

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.from("ai_company_profile").select("company_name,services").maybeSingle()
      setPerfilOk(!!String(data?.company_name ?? "").trim() && !!String(data?.services ?? "").trim())
    }, 0)
    return () => clearTimeout(t)
  }, [supabase])

  const escolhidas = skills.filter((s) => selecionadas.includes(s.id))
  const totalSkills = escolhidas.reduce((t, s) => t + s.content.length, 0)
  const skillsAcimaDoLimite = totalSkills > LIMITE_SKILLS
  const podeGerar = !!nomeDoLead.trim() && !!empresa.trim() && !!site.trim() && !skillsAcimaDoLimite && perfilOk !== false && !gerando

  async function gerar() {
    setGerando(true)
    try {
      const r = await fetch("/api/ia/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name: nomeDoLead,
          lead_title: cargo,
          lead_linkedin: linkedin,
          company_name: empresa,
          company_site: site,
          skill_ids: selecionadas,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return toast.error(d.error ?? "Não foi possível gerar o e-mail.")
      setResultado({ assunto: d.assunto ?? "", corpo: d.corpo ?? "", aviso: d.aviso ?? null })
    } catch {
      toast.error("Não foi possível falar com o servidor. Tente de novo.")
    } finally {
      setGerando(false)
    }
  }

  async function copiar(texto: string, mensagem: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success(mensagem)
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.")
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">IA</h1>
          <p className="text-sm text-muted-foreground">
            Lê o site da empresa, cruza com os dados do lead e escreve o rascunho de um e-mail de prospecção.
          </p>
        </div>
      </div>

      <Alert>
        <Info />
        <AlertDescription>É possível gerar até 10 e-mails automáticos por dia.</AlertDescription>
      </Alert>

      {perfilOk === false && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Informe o nome da sua empresa e os serviços que ela oferece antes de gerar e-mails:{" "}
            <Link href="/settings?tab=ia" className="underline">
              Configurações → IA
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (podeGerar) void gerar()
        }}
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="ia-lead">Nome do lead *</Label>
          <Input id="ia-lead" value={nomeDoLead} maxLength={200} onChange={(e) => setNomeDoLead(e.target.value)} placeholder="Ex.: Marlon Saling" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ia-cargo">Cargo do lead</Label>
          <Input id="ia-cargo" value={cargo} maxLength={200} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Diretor Comercial" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ia-linkedin">LinkedIn do lead</Label>
          <Input id="ia-linkedin" value={linkedin} maxLength={500} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/fulano" />
          <p className="text-xs text-muted-foreground">Preencha o cargo ou o LinkedIn. O link entra só como contexto: a página do perfil não é lida.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ia-empresa">Empresa *</Label>
          <Input id="ia-empresa" value={empresa} maxLength={200} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex.: Top Flex" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ia-site">Site da empresa *</Label>
          <Input id="ia-site" value={site} maxLength={500} onChange={(e) => setSite(e.target.value)} placeholder="topflex.net" />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setSkillsAberto(true)}>
              <Sparkles className="size-4" /> Skills{escolhidas.length > 0 ? ` (${escolhidas.length})` : ""}
            </Button>
            {escolhidas.map((s) => (
              <Badge key={s.id} variant="secondary">
                {s.name}
              </Badge>
            ))}
          </div>
          {skillsAcimaDoLimite && (
            <p className="text-xs text-destructive">
              As skills escolhidas somam {totalSkills.toLocaleString("pt-BR")} caracteres; o máximo é {LIMITE_SKILLS.toLocaleString("pt-BR")}. Desmarque alguma.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!podeGerar}>
            {gerando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {gerando ? "Gerando…" : "Gerar e-mail"}
          </Button>
          {gerando && <span className="text-xs text-muted-foreground">Lendo o site e escrevendo; pode levar até 1 minuto.</span>}
        </div>
      </form>

      {resultado && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Rascunho do e-mail</h2>
          {resultado.aviso && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>{resultado.aviso}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ia-assunto">Assunto</Label>
            <Input id="ia-assunto" value={resultado.assunto} onChange={(e) => setResultado({ ...resultado, assunto: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ia-corpo">Corpo</Label>
            <Textarea id="ia-corpo" rows={14} value={resultado.corpo} onChange={(e) => setResultado({ ...resultado, corpo: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => copiar(resultado.assunto ? `Assunto: ${resultado.assunto}\n\n${resultado.corpo}` : resultado.corpo, "E-mail copiado.")}
            >
              <Copy className="size-4" /> Copiar e-mail
            </Button>
            <Button type="button" variant="outline" onClick={() => copiar(resultado.corpo, "Corpo copiado.")}>
              Copiar só o corpo
            </Button>
            <Button type="button" variant="ghost" onClick={() => void gerar()} disabled={!podeGerar}>
              Gerar de novo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">É um rascunho: revise antes de enviar.</p>
        </section>
      )}

      <SkillsDialog
        aberto={skillsAberto}
        onAbertoChange={setSkillsAberto}
        skills={skills}
        selecionadas={selecionadas}
        onSelecionadasChange={setSelecionadas}
        onMudou={carregarSkills}
      />
    </div>
  )
}

export default function Page() {
  return (
    <RequireRole min="agent">
      <PaginaIa />
    </RequireRole>
  )
}
