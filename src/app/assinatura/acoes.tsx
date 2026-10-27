"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

/** Cria o checkout de assinatura e leva para a página de pagamento da AbacatePay. */
export function BotaoAssinar({ rotulo }: { rotulo: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function assinar() {
    setOcupado(true)
    setErro(null)
    const res = await fetch("/api/assinatura", { method: "POST" })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body?.url) {
      setOcupado(false)
      return setErro(body?.error ?? "Não foi possível abrir o pagamento. Tente de novo.")
    }
    window.location.href = body.url
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={assinar} disabled={ocupado} className="w-full">
        {ocupado ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {rotulo}
      </Button>
      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  )
}

/** Volta do pagamento: recarrega a página (o servidor confere) até o webhook confirmar. */
export function AguardandoConfirmacao() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000)
    const fim = setTimeout(() => clearInterval(t), 120_000)
    return () => {
      clearInterval(t)
      clearTimeout(fim)
    }
  }, [router])
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      Pagamento recebido? Assim que a AbacatePay confirmar, você entra no CRM automaticamente.
    </div>
  )
}

export function BotaoSair() {
  const [saindo, setSaindo] = useState(false)
  async function sair() {
    setSaindo(true)
    await createClient().auth.signOut()
    window.location.href = "/login"
  }
  return (
    <Button variant="ghost" size="sm" onClick={sair} disabled={saindo}>
      <LogOut className="size-4" /> Sair
    </Button>
  )
}
