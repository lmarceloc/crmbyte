import type { StatusDaCadencia, TipoDePasso } from "@/lib/cadencias/tipos"

export const STATUS_CADENCIA: Record<
  StatusDaCadencia,
  { rotulo: string; variant: "default" | "secondary" | "outline" }
> = {
  ativa: { rotulo: "Ativa", variant: "default" },
  pausada: { rotulo: "Pausada", variant: "secondary" },
  rascunho: { rotulo: "Rascunho", variant: "outline" },
}

export const TIPOS: { tipo: TipoDePasso; rotulo: string; cor: string }[] = [
  { tipo: "email", rotulo: "E-mail", cor: "bg-blue-500" },
  { tipo: "espera", rotulo: "Espera", cor: "bg-slate-400" },
  { tipo: "ramo", rotulo: "Ramo (se abriu…)", cor: "bg-violet-500" },
  { tipo: "whatsapp", rotulo: "WhatsApp", cor: "bg-green-500" },
  { tipo: "tarefa", rotulo: "Tarefa", cor: "bg-amber-500" },
  { tipo: "fim", rotulo: "Fim deste caminho", cor: "bg-slate-500" },
]

export const corDoTipo = (t: TipoDePasso) => TIPOS.find((x) => x.tipo === t)!.cor
export const rotuloDoTipo = (t: TipoDePasso) => TIPOS.find((x) => x.tipo === t)!.rotulo
