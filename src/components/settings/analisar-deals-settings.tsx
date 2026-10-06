"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2, Sparkles } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CONFIG_PADRAO,
  configSchema,
  LIMITES_DA_ANALISE,
  LIMITES_DA_CONFIG,
  normalizarConfig,
  type ConfigAnalisarDeals,
} from "@/lib/pipeline/config"
import { CRITERIOS_DE_IA, CRITERIOS_DE_REGRA, INFO_DOS_CRITERIOS, INFO_DOS_REFORCOS, REFORCOS, type Criterio } from "@/lib/pipeline/criterios"

type Limites = Exclude<keyof ConfigAnalisarDeals, "pesos" | "confiancaMinima">

const LIMITES_EM_DIAS: { campo: Limites; rotulo: string; ajuda: string }[] = [
  { campo: "diasSemContato", rotulo: "Dias sem contato", ajuda: "O critério chega ao máximo com este tempo sem falar com o cliente." },
  { campo: "diasSemAtualizacao", rotulo: "Dias sem atualização", ajuda: "O máximo do critério “menos atualizações”." },
  { campo: "diasParadoNaEtapa", rotulo: "Dias parado na etapa", ajuda: "O máximo do critério “parado na etapa”." },
  { campo: "diasFechamentoProximo", rotulo: "Janela do fechamento", ajuda: "Quantos dias antes da previsão de fechamento o critério começa a pesar." },
]

/** Os campos como o usuário digita (texto), para não brigar com o teclado enquanto edita. */
function paraTexto(c: ConfigAnalisarDeals): Record<string, string> {
  const t: Record<string, string> = { confiancaMinima: String(c.confiancaMinima) }
  for (const k of Object.keys(c.pesos)) t[`peso.${k}`] = String(c.pesos[k as Criterio])
  for (const r of REFORCOS) t[`reforco.${r}`] = String(c.reforcos[r])
  for (const { campo } of LIMITES_EM_DIAS) t[campo] = String(c[campo])
  return t
}

const numero = (s: string | undefined) => (s === undefined || s.trim() === "" ? NaN : Number(s.replace(",", ".")))

function deTexto(t: Record<string, string>): unknown {
  return {
    pesos: Object.fromEntries(
      [...CRITERIOS_DE_REGRA, ...CRITERIOS_DE_IA].map((c) => [c, numero(t[`peso.${c}`])]),
    ),
    reforcos: Object.fromEntries(REFORCOS.map((r) => [r, numero(t[`reforco.${r}`])])),
    diasSemContato: numero(t.diasSemContato),
    diasSemAtualizacao: numero(t.diasSemAtualizacao),
    diasParadoNaEtapa: numero(t.diasParadoNaEtapa),
    diasFechamentoProximo: numero(t.diasFechamentoProximo),
    confiancaMinima: numero(t.confiancaMinima),
  }
}

function Campo({
  id,
  rotulo,
  ajuda,
  valor,
  onChange,
  desabilitado,
  passo = "any",
}: {
  id: string
  rotulo: string
  ajuda?: string
  valor: string
  onChange: (v: string) => void
  desabilitado: boolean
  passo?: string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {rotulo}
      </Label>
      <Input id={id} type="number" inputMode="decimal" step={passo} value={valor} onChange={(e) => onChange(e.target.value)} disabled={desabilitado} />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  )
}

/**
 * Pesos e limites do botão Analisar Deals (aba IA). Todos veem; só admin+ grava (RLS de
 * `analisar_deals_config`). Sem nada salvo, valem os padrões.
 */
export function AnalisarDealsSettings() {
  const supabase = createClient()
  const { canEditSettings } = useAuth()

  const [texto, setTexto] = useState<Record<string, string>>(() => paraTexto(CONFIG_PADRAO))
  const [salvo, setSalvo] = useState<ConfigAnalisarDeals>(CONFIG_PADRAO)
  const [carregado, setCarregado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("analisar_deals_config").select("config").maybeSingle()
    // sem a tabela (migration 045 não aplicada) ou sem linha: padrão
    const atual = error || !data ? CONFIG_PADRAO : normalizarConfig(data.config)
    setSalvo(atual)
    setTexto(paraTexto(atual))
    setCarregado(true)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0)
    return () => clearTimeout(t)
  }, [carregar])

  const analise = useMemo(() => configSchema.safeParse(deTexto(texto)), [texto])
  const alterado = !analise.success || JSON.stringify(analise.data) !== JSON.stringify(salvo)
  const editar = (chave: string) => (v: string) => setTexto((t) => ({ ...t, [chave]: v }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!analise.success)
      return toast.error(
        `Confira os valores: pesos de ${LIMITES_DA_CONFIG.peso.min} a ${LIMITES_DA_CONFIG.peso.max}, dias de ${LIMITES_DA_CONFIG.dias.min} a ${LIMITES_DA_CONFIG.dias.max} (inteiros) e confiança de 0 a 1.`,
      )
    setSalvando(true)
    const r = await fetch("/api/analisar-deals/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analise.data),
    })
    const d = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) return toast.error(d.error ?? "Não foi possível salvar.")
    setSalvo(d.config)
    setTexto(paraTexto(d.config))
    toast.success("Configuração do Analisar Deals salva.")
  }

  const grupo = (titulo: string, criterios: readonly Criterio[]) => (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {criterios.map((c) => (
          <Campo
            key={c}
            id={`ad-peso-${c}`}
            rotulo={INFO_DOS_CRITERIOS[c].rotulo}
            valor={texto[`peso.${c}`] ?? ""}
            onChange={editar(`peso.${c}`)}
            desabilitado={!canEditSettings}
            passo="0.5"
          />
        ))}
      </div>
    </div>
  )

  return (
    <section className="mt-6 max-w-2xl animate-in fade-in-50 duration-200">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="size-4 text-primary" />
            Analisar Deals
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            O botão Analisar Deals do funil ordena os negócios em aberto por atenção (de 0 a 100) e mostra o que fazer primeiro.
            O peso diz o quanto cada critério conta na média; peso 0 ignora o critério.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!carregado ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : (
            <form onSubmit={salvar} className="space-y-5">
              {!canEditSettings && (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">Apenas administradores podem editar estes valores.</p>
              )}
              {grupo("Pesos dos critérios", CRITERIOS_DE_REGRA)}
              {grupo("Pesos dos critérios com IA", CRITERIOS_DE_IA)}

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reforços (sempre aplicados)</h4>
                <p className="text-xs text-muted-foreground">
                  Temperatura e previsão de fechamento multiplicam a nota de qualquer análise, marcados ou não: um lead quente parado sobe na
                  lista; um frio parado, não. 5 é o padrão (quente multiplica a nota por 1,6), 10 dobra o efeito e 0 desliga.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {REFORCOS.map((r) => (
                    <Campo
                      key={r}
                      id={`ad-reforco-${r}`}
                      rotulo={INFO_DOS_REFORCOS[r].rotulo}
                      ajuda={INFO_DOS_REFORCOS[r].descricao}
                      valor={texto[`reforco.${r}`] ?? ""}
                      onChange={editar(`reforco.${r}`)}
                      desabilitado={!canEditSettings}
                      passo="0.5"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limites</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {LIMITES_EM_DIAS.map(({ campo, rotulo, ajuda }) => (
                    <Campo
                      key={campo}
                      id={`ad-${campo}`}
                      rotulo={rotulo}
                      ajuda={ajuda}
                      valor={texto[campo] ?? ""}
                      onChange={editar(campo)}
                      desabilitado={!canEditSettings}
                      passo="1"
                    />
                  ))}
                  <Campo
                    id="ad-confianca"
                    rotulo="Confiança mínima da IA"
                    ajuda="De 0 a 1. Abaixo disto a resposta da IA é ignorada e o item mostra “IA incerta”."
                    valor={texto.confiancaMinima ?? ""}
                    onChange={editar("confiancaMinima")}
                    desabilitado={!canEditSettings}
                    passo="0.05"
                  />
                </div>
              </div>

              <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Cada análise cobre no máximo {LIMITES_DA_ANALISE.negocios} negócios. Nos critérios com IA, o texto das notas, das observações e das
                  mensagens do cliente é enviado a um serviço externo de análise (sem e-mail nem telefone). A chave fica em Configurações → Chaves
                  de API; sem ela, o botão usa o modelo gratuito do OpenRouter em modo reduzido.
                </span>
              </p>

              {canEditSettings && (
                <div className="flex gap-2">
                  <Button type="submit" disabled={salvando || !alterado}>
                    {salvando && <Loader2 className="mr-1 size-4 animate-spin" />}Salvar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setTexto(paraTexto(CONFIG_PADRAO))} disabled={salvando}>
                    Restaurar padrão
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
