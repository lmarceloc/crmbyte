"use client"

import { useRef } from "react"
import { AlertTriangle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { haEmailAntes } from "@/lib/cadencias/arvore"
import { renderizarExemplo, variaveisDesconhecidas, VARIAVEIS } from "@/lib/cadencias/renderizar"
import type { Passo } from "@/lib/cadencias/tipos"
import { rotuloDoTipo } from "./status"

interface Props {
  passo: Passo
  todos: Passo[]
  somenteLeitura: boolean
  onChange: (p: Passo) => void
  onFechar: () => void
}

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
    <span>{children}</span>
  </div>
)

const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(v)) || min))

export function PainelDoPasso({ passo, todos, somenteLeitura, onChange, onFechar }: Props) {
  const assuntoRef = useRef<HTMLInputElement>(null)
  const corpoRef = useRef<HTMLTextAreaElement>(null)
  const ultimoFocado = useRef<"assunto" | "corpo">("corpo")

  function inserirVariavel(chave: string) {
    if (passo.tipo !== "email") return
    const campo = ultimoFocado.current === "assunto" && !passo.mesmaConversa ? "assunto" : "corpo"
    const el = campo === "assunto" ? assuntoRef.current : corpoRef.current
    const texto = `{{${chave}}}`
    const atual = passo[campo]
    const ini = el?.selectionStart ?? atual.length
    const fim = el?.selectionEnd ?? atual.length
    onChange({ ...passo, [campo]: atual.slice(0, ini) + texto + atual.slice(fim) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(ini + texto.length, ini + texto.length)
    })
  }

  const chips = (
    <div className="flex flex-wrap gap-1">
      {VARIAVEIS.map((v) => (
        <button
          key={v.chave}
          type="button"
          disabled={somenteLeitura}
          onClick={() => inserirVariavel(v.chave)}
          className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {`{{${v.chave}}}`}
        </button>
      ))}
    </div>
  )

  return (
    <aside className="w-96 shrink-0 space-y-4 overflow-auto rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{rotuloDoTipo(passo.tipo)}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onFechar}>
          <X className="size-4" />
        </Button>
      </div>

      {passo.tipo === "email" && (
        <>
          <p className="text-xs text-muted-foreground">
            Sai da caixa do dono do negócio; sem caixa, da caixa padrão ou do SMTP da instalação.
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="mesma">Responder na mesma conversa</Label>
            <Switch
              id="mesma"
              checked={passo.mesmaConversa}
              disabled={somenteLeitura || !haEmailAntes(todos, passo.id)}
              onCheckedChange={(v) => onChange({ ...passo, mesmaConversa: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Assunto</Label>
            <Input
              ref={assuntoRef}
              value={passo.assunto}
              maxLength={300}
              disabled={somenteLeitura || passo.mesmaConversa}
              onFocus={() => (ultimoFocado.current = "assunto")}
              onChange={(e) => onChange({ ...passo, assunto: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Corpo</Label>
            <Textarea
              ref={corpoRef}
              rows={10}
              value={passo.corpo}
              maxLength={20000}
              disabled={somenteLeitura}
              onFocus={() => (ultimoFocado.current = "corpo")}
              onChange={(e) => onChange({ ...passo, corpo: e.target.value })}
            />
          </div>
          {chips}
          {variaveisDesconhecidas(passo.assunto + " " + passo.corpo).length > 0 && (
            <Aviso>
              Variável inexistente:{" "}
              {variaveisDesconhecidas(passo.assunto + " " + passo.corpo)
                .map((v) => `{{${v}}}`)
                .join(", ")}
              . Ela aparecerá como está no e-mail.
            </Aviso>
          )}
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Prévia (lead de exemplo)</div>
            {!passo.mesmaConversa && <div className="font-medium">{renderizarExemplo(passo.assunto) || "(sem assunto)"}</div>}
            <div className="whitespace-pre-wrap">{renderizarExemplo(passo.corpo)}</div>
            <div className="pt-2 text-[11px] text-muted-foreground">
              Não quer mais receber estes e-mails? Descadastrar
            </div>
          </div>
        </>
      )}

      {passo.tipo === "espera" && (
        <div className="space-y-1.5">
          <Label>Dias úteis de espera (1–365)</Label>
          <Input
            type="number"
            min={1}
            max={365}
            value={passo.diasUteis}
            disabled={somenteLeitura}
            onChange={(e) => onChange({ ...passo, diasUteis: num(e.target.value, 1, 365) })}
          />
        </div>
      )}

      {passo.tipo === "ramo" && (
        <>
          <div className="space-y-1.5">
            <Label>Condição</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={passo.condicao.tipo}
              disabled={somenteLeitura}
              onChange={(e) => {
                const t = e.target.value as "abriu" | "clicou" | "respondeu"
                onChange({
                  ...passo,
                  condicao: t === "abriu" ? { tipo: "abriu", vezes: 2, dentroDeDias: 3 } : { tipo: t, dentroDeDias: 3 },
                })
              }}
            >
              <option value="abriu">Abriu o e-mail</option>
              <option value="clicou">Clicou</option>
              <option value="respondeu">Respondeu</option>
            </select>
          </div>
          {passo.condicao.tipo !== "abriu" && (
            <Aviso>Cliques e respostas ainda não são rastreados: esta condição sempre cai em “Não”.</Aviso>
          )}
          {passo.condicao.tipo === "abriu" && (
            <div className="space-y-1.5">
              <Label>Número de aberturas (1–50)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={passo.condicao.vezes}
                disabled={somenteLeitura}
                onChange={(e) =>
                  onChange({ ...passo, condicao: { ...(passo.condicao as { tipo: "abriu"; vezes: number; dentroDeDias: number }), vezes: num(e.target.value, 1, 50) } })
                }
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Dentro de quantos dias corridos (1–365)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={passo.condicao.dentroDeDias}
              disabled={somenteLeitura}
              onChange={(e) =>
                onChange({ ...passo, condicao: { ...passo.condicao, dentroDeDias: num(e.target.value, 1, 365) } })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            As aberturas contam no acumulado da inscrição (todos os e-mails). Depois de um ramo o caminho termina em cada lado.
          </p>
        </>
      )}

      {passo.tipo === "whatsapp" && (
        <>
          <Aviso>
            O worker ainda não envia WhatsApp: ao chegar neste passo a inscrição é parada com falha.
          </Aviso>
          <Textarea
            rows={6}
            maxLength={4096}
            value={passo.mensagem}
            disabled={somenteLeitura}
            onChange={(e) => onChange({ ...passo, mensagem: e.target.value })}
          />
        </>
      )}

      {passo.tipo === "tarefa" && (
        <>
          <p className="text-xs text-muted-foreground">
            A tarefa vira uma nota no contato (o CRM não tem tabela de tarefas). Variáveis são aplicadas no título.
          </p>
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={passo.titulo}
              maxLength={300}
              disabled={somenteLeitura}
              onChange={(e) => onChange({ ...passo, titulo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo em dias úteis (0–365)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={passo.prazoDias}
              disabled={somenteLeitura}
              onChange={(e) => onChange({ ...passo, prazoDias: num(e.target.value, 0, 365) })}
            />
          </div>
        </>
      )}
    </aside>
  )
}
