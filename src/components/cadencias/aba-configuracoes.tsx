"use client"

import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ConfiguracaoDaCadencia, DiaDaSemana } from "@/lib/cadencias/tipos"

const DIAS: { v: DiaDaSemana; r: string }[] = [
  { v: "seg", r: "Seg" },
  { v: "ter", r: "Ter" },
  { v: "qua", r: "Qua" },
  { v: "qui", r: "Qui" },
  { v: "sex", r: "Sex" },
  { v: "sab", r: "Sáb" },
  { v: "dom", r: "Dom" },
]

const normalizarTag = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="font-medium">{titulo}</h3>
      {children}
    </section>
  )
}

interface Caixa {
  id: string
  email: string
}

interface Props {
  config: ConfiguracaoDaCadencia
  somenteLeitura: boolean
  onChange: (c: ConfiguracaoDaCadencia) => void
}

export function AbaConfiguracoes({ config, somenteLeitura, onChange }: Props) {
  const [caixas, setCaixas] = useState<Caixa[]>([])
  useEffect(() => {
    fetch("/api/caixas-de-envio")
      .then((r) => (r.ok ? r.json() : { caixas: [] }))
      .then((b) => setCaixas(b.caixas ?? []))
      .catch(() => setCaixas([]))
  }, [])

  const set = (parcial: Partial<ConfiguracaoDaCadencia>) => onChange({ ...config, ...parcial })
  const paradas: { k: keyof ConfiguracaoDaCadencia["paradas"]; r: string; trava?: boolean }[] = [
    { k: "descadastro", r: "Quando o contato se descadastrar (obrigatório)", trava: true },
    { k: "ganhoOuPerdido", r: "Quando o negócio for ganho ou perdido" },
    { k: "respondeu", r: "Quando o contato responder" },
    { k: "bounce", r: "Quando o e-mail voltar (bounce)" },
  ]
  const campoSel = "h-9 w-full rounded-md border bg-background px-2 text-sm"

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Secao titulo="Inscrição">
        <div className="space-y-1.5">
          <Label>Tag do segmento</Label>
          <Input
            value={config.tagDoSegmento}
            maxLength={80}
            disabled={somenteLeitura}
            onChange={(e) => set({ tagDoSegmento: normalizarTag(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            Informativa e usada na variável {"{{segmento}}"}. Os negócios entram manualmente, na aba Inscritos.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label>Só contatos com e-mail validado</Label>
          <Switch
            checked={config.somenteEmailValidado}
            disabled={somenteLeitura}
            onCheckedChange={(v) => set({ somenteEmailValidado: v })}
          />
        </div>
      </Secao>

      <Secao titulo="Remetente">
        <div className="space-y-1.5">
          <Label>Caixa padrão</Label>
          <select
            className={campoSel}
            disabled={somenteLeitura}
            value={config.caixaPadraoId ?? ""}
            onChange={(e) => set({ caixaPadraoId: e.target.value || null })}
          >
            <option value="">Servidor de e-mail da instalação</option>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Usada quando o dono do negócio não tem caixa própria.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Limite diário desta cadência por caixa (1–10000)</Label>
          <Input
            type="number"
            min={1}
            max={10000}
            value={config.limiteDiarioPorCaixa}
            disabled={somenteLeitura}
            onChange={(e) =>
              set({ limiteDiarioPorCaixa: Math.max(1, Math.min(10000, Math.floor(Number(e.target.value)) || 1)) })
            }
          />
        </div>
      </Secao>

      <Secao titulo="Janela de envio">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Input
              type="time"
              value={config.janela.inicio}
              disabled={somenteLeitura}
              onChange={(e) => set({ janela: { ...config.janela, inicio: e.target.value || "08:00" } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <Input
              type="time"
              value={config.janela.fim}
              disabled={somenteLeitura}
              onChange={(e) => set({ janela: { ...config.janela, fim: e.target.value || "18:00" } })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((d) => {
            const on = config.janela.dias.includes(d.v)
            return (
              <button
                key={d.v}
                type="button"
                disabled={somenteLeitura}
                onClick={() =>
                  set({
                    janela: {
                      ...config.janela,
                      dias: on ? config.janela.dias.filter((x) => x !== d.v) : [...config.janela.dias, d.v],
                    },
                  })
                }
                className={`rounded-md border px-3 py-1 text-sm disabled:opacity-60 ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {d.r}
              </button>
            )
          })}
        </div>
        <div className="space-y-1.5">
          <Label>Fuso horário</Label>
          <Input
            value={config.fuso}
            maxLength={80}
            disabled={somenteLeitura}
            onChange={(e) => set({ fuso: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Ex.: America/Sao_Paulo. Fora da janela os e-mails esperam; as esperas em dias úteis são contadas em UTC.
          </p>
        </div>
      </Secao>

      <Secao titulo="Quando para">
        {paradas.map((p) => (
          <div key={p.k} className="flex items-center justify-between gap-3">
            <Label>{p.r}</Label>
            <Switch
              checked={config.paradas[p.k]}
              disabled={somenteLeitura || p.trava}
              onCheckedChange={(v) => set({ paradas: { ...config.paradas, [p.k]: v } })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Respostas e bounces são lidos da caixa de entrada das caixas de envio que têm IMAP configurado.
        </p>
      </Secao>
    </div>
  )
}
