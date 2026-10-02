export interface NegocioLinha {
  id: string
  title: string
  value: number
  status: "open" | "won" | "lost"
  created_at: string
  closed_at: string | null
  lost_reason: string | null
  lost_note: string | null
  company_id: string | null
  company_name: string | null
}

export interface ResumoEmpresa {
  chave: string
  empresa: string
  total: number
  abertos: number
  ganhos: number
  perdidos: number
  valorAberto: number
  vendido: number
  perdido: number
  /** Total vendido / negócios ganhos. */
  ticketMedio: number
  /** Ganhos / (ganhos + perdidos). null quando nada foi fechado. */
  conversao: number | null
  negocios: NegocioLinha[]
}

export interface MotivoPerda {
  motivo: string
  quantidade: number
  valor: number
}

export const SEM_EMPRESA = "Sem empresa"
export const SEM_MOTIVO = "Sem motivo informado"

export function agruparPorEmpresa(negocios: NegocioLinha[]): ResumoEmpresa[] {
  const mapa = new Map<string, ResumoEmpresa>()
  for (const n of negocios) {
    const chave = n.company_id ?? "__sem_empresa__"
    let r = mapa.get(chave)
    if (!r) {
      r = {
        chave,
        empresa: n.company_name?.trim() || SEM_EMPRESA,
        total: 0, abertos: 0, ganhos: 0, perdidos: 0,
        valorAberto: 0, vendido: 0, perdido: 0,
        ticketMedio: 0, conversao: null, negocios: [],
      }
      mapa.set(chave, r)
    }
    const v = Number(n.value) || 0
    r.total++
    r.negocios.push(n)
    if (n.status === "won") { r.ganhos++; r.vendido += v }
    else if (n.status === "lost") { r.perdidos++; r.perdido += v }
    else { r.abertos++; r.valorAberto += v }
  }
  for (const r of mapa.values()) {
    r.ticketMedio = r.ganhos > 0 ? r.vendido / r.ganhos : 0
    r.conversao = r.ganhos + r.perdidos > 0 ? r.ganhos / (r.ganhos + r.perdidos) : null
  }
  return [...mapa.values()].sort((a, b) => b.vendido - a.vendido || b.total - a.total || a.empresa.localeCompare(b.empresa))
}

export function motivosDePerda(negocios: NegocioLinha[]): MotivoPerda[] {
  const mapa = new Map<string, MotivoPerda>()
  for (const n of negocios) {
    if (n.status !== "lost") continue
    const motivo = n.lost_reason?.trim() || SEM_MOTIVO
    const m = mapa.get(motivo) ?? { motivo, quantidade: 0, valor: 0 }
    m.quantidade++
    m.valor += Number(n.value) || 0
    mapa.set(motivo, m)
  }
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
}

export function totais(empresas: ResumoEmpresa[]) {
  const t = { empresas: empresas.length, total: 0, abertos: 0, ganhos: 0, perdidos: 0, valorAberto: 0, vendido: 0, perdido: 0 }
  for (const e of empresas) {
    t.total += e.total; t.abertos += e.abertos; t.ganhos += e.ganhos; t.perdidos += e.perdidos
    t.valorAberto += e.valorAberto; t.vendido += e.vendido; t.perdido += e.perdido
  }
  return { ...t, ticketMedio: t.ganhos > 0 ? t.vendido / t.ganhos : 0, conversao: t.ganhos + t.perdidos > 0 ? t.ganhos / (t.ganhos + t.perdidos) : null }
}

export function csvEscape(v: string | number): string {
  const s = String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
