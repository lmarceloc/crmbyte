// Inscrições ATIVAS em outras cadências que tocam os negócios, contatos ou
// empresas informados. Usado pela tela (cliente do usuário, sob RLS) e pela API
// de inscrição (service role, filtrando a conta) — a regra em si está em
// inscricao-do-negocio.ts (`ocupacaoEmOutraCadencia`).
//
// A inscrição pode não ter negócio (contato inscrito direto): aí a empresa é a
// do contato.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { InscricaoEmOutraCadencia } from "./inscricao-do-negocio"

type Empresa = { company_id: string | null }
type Linha = {
  deal_id: string | null
  contact_id: string
  email_cadences: { name: string } | { name: string }[] | null
  deals: Empresa | Empresa[] | null
  contacts: Empresa | Empresa[] | null
}
const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export async function inscricoesAtivasEmOutras(
  db: SupabaseClient,
  cadenciaId: string,
  alvo: { dealIds: string[]; contactIds: string[]; companyIds: string[] },
  accountId?: string,
): Promise<InscricaoEmOutraCadencia[]> {
  const base = (embed = "deals(company_id), contacts(company_id)") => {
    let q = db
      .from("email_cadence_enrollments")
      .select(`deal_id,contact_id, email_cadences(name), ${embed}`)
      .eq("status", "ativa")
      .neq("cadence_id", cadenciaId)
    if (accountId) q = q.eq("account_id", accountId)
    return q
  }
  const filtros: string[] = []
  if (alvo.dealIds.length) filtros.push(`deal_id.in.(${alvo.dealIds.join(",")})`)
  if (alvo.contactIds.length) filtros.push(`contact_id.in.(${alvo.contactIds.join(",")})`)
  const consultas = []
  if (filtros.length) consultas.push(base().or(filtros.join(",")))
  if (alvo.companyIds.length) {
    consultas.push(base("deals!inner(company_id), contacts(company_id)").in("deals.company_id", alvo.companyIds))
    consultas.push(base("deals(company_id), contacts!inner(company_id)").in("contacts.company_id", alvo.companyIds))
  }
  const resultados = await Promise.all(consultas)
  const linhas: Linha[] = []
  for (const r of resultados) {
    if (r.error) throw new Error(r.error.message)
    linhas.push(...((r.data ?? []) as unknown as Linha[]))
  }
  return linhas.map((l) => ({
    deal_id: l.deal_id,
    contact_id: l.contact_id,
    company_id: um(l.deals)?.company_id ?? um(l.contacts)?.company_id ?? null,
    cadencia: um(l.email_cadences)?.name ?? "outra cadência",
  }))
}
