"use client"

import { useState } from "react"
import { FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { LIMITE_SKILLS } from "@/lib/ia/prompt"
import { createClient } from "@/lib/supabase/client"

export interface Skill {
  id: string
  name: string
  description: string
  content: string
}

const MAX_CONTEUDO = 20_000
const MAX_NOME = 100
const MAX_DESCRICAO = 500

/**
 * Skills = nome + descrição + regras ou conhecimento. Podem ser regras que o modelo segue
 * (tom de voz, estrutura do e-mail) ou só material de apoio, como o resumo de um livro sobre
 * escrever bem. Aqui a equipe cria, edita, apaga e marca as que valem para a geração.
 */
export function SkillsDialog({
  aberto,
  onAbertoChange,
  skills,
  selecionadas,
  onSelecionadasChange,
  onMudou,
}: {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  skills: Skill[]
  selecionadas: string[]
  onSelecionadasChange: (ids: string[]) => void
  /** Recarrega a lista depois de criar, editar ou apagar. */
  onMudou: () => Promise<void> | void
}) {
  const supabase = createClient()
  const { accountId, user } = useAuth()
  const confirmar = useConfirmarExclusao()

  // null = lista; { id: null } = nova skill; { id } = editando
  const [edicao, setEdicao] = useState<{ id: string | null } | null>(null)
  const [nome, setNome] = useState("")
  const [descricao, setDescricao] = useState("")
  const [conteudo, setConteudo] = useState("")
  const [salvando, setSalvando] = useState(false)

  const totalEscolhido = skills.filter((s) => selecionadas.includes(s.id)).reduce((t, s) => t + s.content.length, 0)
  const acimaDoLimite = totalEscolhido > LIMITE_SKILLS

  function abrirEdicao(skill: Skill | null) {
    setEdicao({ id: skill?.id ?? null })
    setNome(skill?.name ?? "")
    setDescricao(skill?.description ?? "")
    setConteudo(skill?.content ?? "")
  }

  function alternar(id: string, marcada: boolean) {
    onSelecionadasChange(marcada ? [...selecionadas, id] : selecionadas.filter((x) => x !== id))
  }

  async function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = "" // permite escolher o mesmo arquivo de novo
    if (!arquivo) return
    if (arquivo.size > MAX_CONTEUDO * 4) return toast.error("Arquivo grande demais para uma skill.")
    const texto = (await arquivo.text()).trim()
    if (texto.length > MAX_CONTEUDO)
      return toast.error(`O arquivo tem ${texto.length.toLocaleString("pt-BR")} caracteres; o máximo é ${MAX_CONTEUDO.toLocaleString("pt-BR")}.`)
    setConteudo(texto)
    toast.success(`Arquivo carregado: ${texto.length.toLocaleString("pt-BR")} caracteres.`)
    if (!nome.trim()) setNome(arquivo.name.replace(/\.[^.]+$/, "").slice(0, MAX_NOME))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!edicao) return
    const n = nome.trim()
    const d = descricao.trim()
    const c = conteudo.trim()
    if (!n) return toast.error("Dê um nome à skill.")
    if (!c) return toast.error("Escreva as regras ou o conhecimento da skill.")
    if (!accountId || !user) return toast.error("Seu perfil não está vinculado a uma conta.")

    setSalvando(true)
    const consulta = edicao.id
      ? supabase.from("ai_skills").update({ name: n, description: d, content: c }).eq("id", edicao.id)
      : supabase.from("ai_skills").insert({ account_id: accountId, user_id: user.id, name: n, description: d, content: c })
    const { data, error } = await consulta.select("id").single()
    setSalvando(false)
    if (error || !data) {
      toast.error(error?.code === "23505" ? "Já existe uma skill com esse nome." : "Não foi possível salvar a skill.")
      return
    }
    if (!edicao.id) onSelecionadasChange([...selecionadas, data.id as string]) // a nova já vem marcada
    await onMudou()
    toast.success("Skill salva.")
    setEdicao(null)
  }

  async function apagar(skill: Skill) {
    if (!(await confirmar({ titulo: `Apagar a skill "${skill.name}"?`, confirmar: "Apagar" }))) return
    const { error } = await supabase.from("ai_skills").delete().eq("id", skill.id)
    if (error) return toast.error("Não foi possível apagar a skill.")
    onSelecionadasChange(selecionadas.filter((x) => x !== skill.id))
    await onMudou()
    toast.success("Skill apagada.")
  }

  function fechar(a: boolean) {
    if (!a) setEdicao(null)
    onAbertoChange(a)
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{edicao ? (edicao.id ? "Editar skill" : "Nova skill") : "Skills"}</DialogTitle>
          <DialogDescription>
            {edicao
              ? "Regras que o modelo segue, ou conhecimento de escrita que o ajuda a escrever melhor."
              : "Regras (tom de voz, estrutura do e-mail…) ou conhecimento de escrita (ex.: resumo de um livro). Marque as que valem para esta geração."}
          </DialogDescription>
        </DialogHeader>

        {edicao ? (
          <form onSubmit={salvar} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {/* só os campos rolam; o -m-1/p-1 evita cortar o anel de foco dos inputs */}
            <div className="-m-1 min-h-0 flex-1 space-y-3 overflow-y-auto p-1">
            <div className="space-y-1.5">
              <Label htmlFor="skill-nome">Nome *</Label>
              <Input id="skill-nome" value={nome} maxLength={MAX_NOME} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Tom de voz da agência" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="skill-descricao">Descrição</Label>
              <Input
                id="skill-descricao"
                value={descricao}
                maxLength={MAX_DESCRICAO}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Para que serve e quando usar. Ex.: Estilo direto para a primeira abordagem."
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="skill-conteudo">Regras ou conhecimento *</Label>
                <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline">
                  <FileUp className="size-3.5" />
                  Subir arquivo (.md ou .txt)
                  <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="sr-only" onChange={lerArquivo} />
                </label>
              </div>
              <Textarea
                id="skill-conteudo"
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                className="h-56 max-h-[40dvh] resize-y overflow-y-auto field-sizing-fixed"
                maxLength={MAX_CONTEUDO}
                placeholder="Regras: &quot;Escreva em primeira pessoa e termine propondo 15 minutos de conversa.&quot; Ou conhecimento: cole o resumo de um livro sobre escrita persuasiva."
              />
              <p className="text-right text-xs text-muted-foreground">
                {conteudo.length.toLocaleString("pt-BR")} / {MAX_CONTEUDO.toLocaleString("pt-BR")}
              </p>
            </div>
            </div>
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={() => setEdicao(null)} disabled={salvando}>
                Voltar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="size-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {skills.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhuma skill ainda. Crie a primeira para orientar o modelo.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {skills.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={selecionadas.includes(s.id)}
                      onCheckedChange={(v) => alternar(s.id, !!v)}
                      aria-label={`Usar a skill ${s.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{(s.description || s.content).replace(/\s+/g, " ")}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Editar ${s.name}`} onClick={() => abrirEdicao(s)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Apagar ${s.name}`} onClick={() => apagar(s)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {selecionadas.length > 0 && (
              <p className={`text-xs ${acimaDoLimite ? "text-destructive" : "text-muted-foreground"}`}>
                Escolhidas: {totalEscolhido.toLocaleString("pt-BR")} de {LIMITE_SKILLS.toLocaleString("pt-BR")} caracteres
                {acimaDoLimite ? " — desmarque alguma para poder gerar." : "."}
              </p>
            )}
            </div>
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={() => abrirEdicao(null)}>
                <Plus className="size-4" /> Nova skill
              </Button>
              <Button type="button" onClick={() => fechar(false)}>
                Concluir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
