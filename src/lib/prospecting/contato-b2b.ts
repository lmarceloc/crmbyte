// Contato de um lead B2B (Treg). Dois caminhos chegam aqui:
//  - o tick do worker, quando o e-mail do lead foi revelado e VERIFICADO;
//  - a importação para o funil, quando o lead ficou SEM e-mail verificado e o
//    vendedor decidiu trabalhá-lo mesmo assim (nome, cargo, empresa, LinkedIn).
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterOuCriarEmpresa } from "@/lib/companies";
import type { Lead } from "./treg";

type Admin = SupabaseClient;

export interface OrigemDoContato {
  campaignId: string;
  accountId: string;
  /** Base legal (legítimo interesse) que a busca registrou. */
  legalBasisRef: string | null;
  /** Quem figura como dono do contato; resolvido só se o contato for mesmo criado. */
  quemCria: () => Promise<string | null>;
}

/**
 * Cria (ou reaproveita) o contato do lead. Devolve o id, ou `null` se o contato
 * já existe e pediu para sair.
 *
 * A chave de reaproveitamento é o e-mail; sem e-mail, o LinkedIn — é a única
 * identidade que o lead tem, e duplicar o cadastro é o que o CRM evita.
 */
export async function criarContatoB2b(
  admin: Admin,
  origem: OrigemDoContato,
  lead: Lead,
  email: string | null,
): Promise<string | null> {
  const procura = admin
    .from("contacts")
    .select("id,email_unsubscribed_at")
    .eq("account_id", origem.accountId);
  const { data: existente } = email
    ? await procura.ilike("email", email).limit(1).maybeSingle()
    : lead.linkedin
      ? await procura.eq("linkedin_url", lead.linkedin).limit(1).maybeSingle()
      : { data: null };
  if (existente) return existente.email_unsubscribed_at ? null : existente.id;

  const userId = await origem.quemCria();
  if (!userId) throw new Error("Conta sem usuário responsável para criar o contato.");
  const companyId = await obterOuCriarEmpresa(admin, origem.accountId, userId, {
    nome: lead.companyName,
    website: lead.companyDomain ? `https://${lead.companyDomain}` : null,
  });
  const { data, error } = await admin
    .from("contacts")
    .insert({
      account_id: origem.accountId,
      user_id: userId,
      phone: "",
      name: lead.fullName,
      email,
      company: lead.companyName,
      company_id: companyId,
      job_title: lead.title,
      linkedin_url: lead.linkedin,
      source: "prospecting",
      source_metadata: {
        campaign_id: origem.campaignId,
        lead_key: lead.key,
        company_name: lead.companyName,
        company_domain: lead.companyDomain,
        location: lead.location,
      },
      consent: { legitimate_interest: { ref: origem.legalBasisRef } },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
