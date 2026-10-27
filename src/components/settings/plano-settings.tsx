"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { SettingsPanelHead } from "./settings-panel-head"

type Status = "sem_assinatura" | "pendente" | "ativa" | "pagamento_falhou" | "cancelada"

interface Resposta {
  assinatura: {
    status: Status
    metodo: string | null
    valor_centavos: number
    ativa_desde: string | null
    ultimo_pagamento_em: string | null
    cancelada_em: string | null
    tem_portal: boolean
    teste_ate: string | null
    isenta: boolean
  }
  acesso: { liberado: boolean; motivo: string; testeAte: string | null }
  preco_centavos: number
  pagamento_configurado: boolean
}

const ROTULO: Record<Status, { texto: string; classe: string }> = {
  sem_assinatura: { texto: "Sem assinatura", classe: "bg-muted text-muted-foreground" },
  pendente: { texto: "Aguardando pagamento", classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  ativa: { texto: "Ativa", classe: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  pagamento_falhou: { texto: "Pagamento recusado", classe: "bg-red-500/15 text-red-600 dark:text-red-400" },
  cancelada: { texto: "Cancelada", classe: "bg-muted text-muted-foreground" },
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—")

/** Configurações → Plano: assinatura do CRM pela AbacatePay. */
export function PlanoSettings() {
  const pode = useCan("manage-members")
  const voltouDoPagamento = useSearchParams().get("assinatura") === "ok"
  const [dados, setDados] = useState<Resposta | null>(null)
  const [ocupado, setOcupado] = useState<"assinar" | "portal" | null>(null)

  const carregar = useCallback(
    () =>
      fetch("/api/assinatura")
        .then((res) => (res.ok ? res.json() : null))
        .then((d: Resposta | null) => d && setDados(d))
        .catch(() => {}),
    [],
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  // o webhook pode chegar alguns segundos depois da volta do pagamento
  useEffect(() => {
    if (!voltouDoPagamento || dados?.assinatura.status === "ativa") return
    const t = setInterval(() => void carregar(), 4000)
    const fim = setTimeout(() => clearInterval(t), 60_000)
    return () => {
      clearInterval(t)
      clearTimeout(fim)
    }
  }, [voltouDoPagamento, dados?.assinatura.status, carregar])

  async function abrir(acao: "assinar" | "portal") {
    setOcupado(acao)
    const res = await fetch(acao === "assinar" ? "/api/assinatura" : "/api/assinatura/portal", { method: "POST" })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body?.url) {
      setOcupado(null)
      return toast.error(body?.error?.message ?? body?.error ?? "Não foi possível abrir o pagamento.")
    }
    window.location.href = body.url
  }

  if (!dados) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    )
  }

  const { assinatura: a } = dados
  const rotulo = ROTULO[a.status]
  const ativa = a.status === "ativa"

  return (
    <section>
      <SettingsPanelHead
        title="Plano"
        description="Um preço para o time inteiro, sem cobrança por usuário. O pagamento é feito pela AbacatePay."
      />

      {voltouDoPagamento && !ativa && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          Recebemos você de volta. Assim que a AbacatePay confirmar o pagamento, a assinatura aparece como ativa aqui.
        </div>
      )}

      <div className="space-y-5 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">CRM Byte · mensal</p>
            <p className="mt-1">
              <span className="text-3xl font-bold">{reais(a.valor_centavos)}</span>
              <span className="text-muted-foreground">/mês</span>
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rotulo.classe}`}>{rotulo.texto}</span>
        </div>

        {a.isenta && (
          <p className="text-sm text-muted-foreground">Esta conta está liberada sem assinatura.</p>
        )}
        {dados.acesso.motivo === "teste" && a.teste_ate && (
          <p className="rounded-lg bg-primary-soft p-3 text-sm">
            Teste grátis até <strong>{data(a.teste_ate)}</strong>. Assine antes disso para o time não perder o acesso.
          </p>
        )}

        {(ativa || a.status === "pagamento_falhou" || a.status === "cancelada") && (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Assinante desde</dt>
              <dd className="font-medium">{data(a.ativa_desde)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Último pagamento</dt>
              <dd className="font-medium">{data(a.ultimo_pagamento_em)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Forma de pagamento</dt>
              <dd className="font-medium">{a.metodo === "PIX" ? "Pix" : a.metodo === "CARD" ? "Cartão" : "—"}</dd>
            </div>
          </dl>
        )}

        {a.status === "pagamento_falhou" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            A última cobrança foi recusada. A AbacatePay tenta de novo nos próximos dias; você também pode trocar o
            cartão em &quot;Gerenciar assinatura&quot;.
          </p>
        )}

        {!pode ? (
          <p className="text-sm text-muted-foreground">Só donos e administradores podem gerenciar o plano.</p>
        ) : !dados.pagamento_configurado ? (
          <p className="text-sm text-muted-foreground">O pagamento ainda não foi configurado nesta instalação.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!ativa && (
              <Button onClick={() => abrir("assinar")} disabled={ocupado !== null}>
                {ocupado === "assinar" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                {a.status === "cancelada" ? "Assinar de novo" : `Assinar por ${reais(dados.preco_centavos)}/mês`}
              </Button>
            )}
            {a.tem_portal && (
              <Button variant="outline" onClick={() => abrir("portal")} disabled={ocupado !== null}>
                {ocupado === "portal" ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                Gerenciar assinatura
              </Button>
            )}
          </div>
        )}

        {ativa && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Em &quot;Gerenciar assinatura&quot; você troca o cartão, vê os pagamentos e cancela.
          </p>
        )}
      </div>
    </section>
  )
}
