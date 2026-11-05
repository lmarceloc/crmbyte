// Importar candidatos da prospecção, sem disparar abordagem:
//  - simples (Google Maps): candidato → Contato + Negócio no funil escolhido;
//  - B2B: candidato → só Contato (o negócio nasce depois, quando o lead evoluir).
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterOuCriarEmpresa } from "@/lib/companies";
import { findExistingContact, isEmailUniqueViolation, isUniqueViolation } from "@/lib/contacts/dedupe";
import type { Prospect } from "./apify";
import { MSG_PEDIU_PARA_SAIR, ProspectingError } from "./errors";
import { criarContatoB2b, emailNaoConfirmado } from "./contato-b2b";
import { avaliarImportacaoB2b } from "./importavel";
import { comLock } from "./locks";
import type { Lead } from "./treg";

type Admin = SupabaseClient;

export interface ResultadoDaImportacao {
  imported: number;
  already: number;
  skipped: { id: string; reason: string }[];
}

const cortar = (s: string, n: number) => s.slice(0, n);

export function descricaoSimples(campanha: string, p: Prospect): string {
  return [
    `Origem: Prospecção simples — ${campanha}`,
    p.category && `Categoria: ${p.category}`,
    p.address && `Endereço: ${p.address}`,
    p.phone && `Telefone: ${p.phone}`,
    p.website && `Site: ${p.website}`,
    p.emails.length > 0 && `E-mails: ${p.emails.join(", ")}`,
    p.rating !== null && `Avaliação: ${p.rating}${p.reviews !== null ? ` (${p.reviews} avaliações)` : ""}`,
    p.maps_url && `Mapa: ${p.maps_url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function importarCandidatos(
  admin: Admin,
  p: {
    accountId: string;
    userId: string;
    kind: "simples" | "b2b";
    candidateIds: string[];
    /** Só na prospecção simples: a B2B importa só o contato. */
    pipelineId?: string;
    stageId?: string;
    legalBasisRef?: string;
  },
): Promise<ResultadoDaImportacao> {
  if (p.kind === "b2b") return importarContatosB2b(admin, p);
  if (!p.pipelineId || !p.stageId) throw new ProspectingError("Escolha o funil e a etapa de entrada.", 422);
  const { pipelineId, stageId } = p;
  if (!p.legalBasisRef)
    throw new ProspectingError("Informe a referência do legítimo interesse (LGPD).", 422);

  return comLock(admin, p.accountId, async () => {
    // etapa precisa ser DESTE pipeline e o pipeline desta conta
    const { data: etapa } = await admin
      .from("pipeline_stages")
      .select("id, pipelines!inner(id, account_id)")
      .eq("id", stageId)
      .eq("pipeline_id", pipelineId)
      .eq("pipelines.account_id", p.accountId)
      .maybeSingle();
    if (!etapa) throw new ProspectingError("Escolha uma etapa aberta do funil selecionado.", 422);

    const { data: perfil } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", p.userId)
      .maybeSingle();

    const { data: cands } = await admin
      .from("prospecting_candidates")
      .select("*, prospecting_campaigns!inner(id,name,kind,search)")
      .eq("account_id", p.accountId)
      .eq("prospecting_campaigns.kind", p.kind)
      .in("id", p.candidateIds);

    const res: ResultadoDaImportacao = { imported: 0, already: 0, skipped: [] };
    const achados = new Set((cands ?? []).map((c) => c.id));
    for (const id of p.candidateIds) if (!achados.has(id)) res.skipped.push({ id, reason: "Candidato não encontrado." });

    for (const c of cands ?? []) {
      try {
        if (c.deal_id) {
          res.already++;
          continue;
        }
        const camp = c.prospecting_campaigns as { id: string; name: string; search: { legal_basis_ref?: string } | null };
        let contactId: string | null = c.contact_id;

        const prospect = c.data as Prospect;
        if (!contactId) {
          if (!c.phone) {
            res.skipped.push({ id: c.id, reason: "Sem telefone brasileiro válido." });
            continue;
          }
          const existente = await findExistingContact(admin, p.accountId, c.phone);
          if (existente) contactId = existente.id;
          else {
            const empresaId = await obterOuCriarEmpresa(admin, p.accountId, p.userId, {
              nome: prospect.name,
              website: prospect.website,
            });
            const { data: novo, error } = await admin
              .from("contacts")
              .insert({
                account_id: p.accountId,
                user_id: p.userId,
                phone: c.phone,
                name: prospect.name,
                email: prospect.emails[0] ?? null,
                company: prospect.name,
                company_id: empresaId,
                source: "prospecting",
                source_metadata: { campaign_id: camp.id, place_id: c.place_id, maps_url: prospect.maps_url },
                consent: { legitimate_interest: { ref: p.legalBasisRef } },
              })
              .select("id")
              .single();
            if (error) {
              if (!isUniqueViolation(error)) throw error;
              // corrida: outro processo criou o mesmo telefone; ou o e-mail já é
              // de um contato da conta (o e-mail também é único por conta)
              contactId = (await findExistingContact(admin, p.accountId, c.phone))?.id ?? null;
              if (!contactId && isEmailUniqueViolation(error) && prospect.emails[0]) {
                const { data: doEmail } = await admin
                  .from("contacts")
                  .select("id")
                  .eq("account_id", p.accountId)
                  .ilike("email", prospect.emails[0].replace(/[%_\\]/g, "\\$&"))
                  .limit(1)
                  .maybeSingle();
                contactId = doEmail?.id ?? null;
              }
            } else contactId = novo.id;
          }
        }
        if (!contactId) {
          res.skipped.push({ id: c.id, reason: "Não foi possível resolver o contato." });
          continue;
        }

        const { data: contato } = await admin
          .from("contacts")
          .select("id,email_unsubscribed_at")
          .eq("id", contactId)
          .eq("account_id", p.accountId)
          .maybeSingle();
        if (!contato || contato.email_unsubscribed_at) {
          res.skipped.push({ id: c.id, reason: MSG_PEDIU_PARA_SAIR });
          continue;
        }

        // negócio já existe (mesma origem ou contato com negócio aberto no funil)?
        const { data: dealOrigem } = await admin
          .from("deals")
          .select("id")
          .eq("account_id", p.accountId)
          .eq("source", "prospecting")
          .eq("external_id", c.id)
          .maybeSingle();
        const { data: dealAberto } = dealOrigem
          ? { data: null }
          : await admin
              .from("deals")
              .select("id")
              .eq("account_id", p.accountId)
              .eq("contact_id", contactId)
              .eq("pipeline_id", pipelineId)
              .eq("status", "open")
              .limit(1)
              .maybeSingle();
        const existente = dealOrigem ?? dealAberto;
        if (existente) {
          await admin
            .from("prospecting_candidates")
            .update({ contact_id: contactId, deal_id: existente.id })
            .eq("id", c.id);
          res.already++;
          continue;
        }

        const titulo = cortar((c.data as Prospect).name, 200);
        const descricao = cortar(descricaoSimples(camp.name, c.data as Prospect), 2000);
        const empresaDoNegocio = await obterOuCriarEmpresa(admin, p.accountId, p.userId, {
          nome: (c.data as Prospect).name,
          website: (c.data as Prospect).website,
        });
        const { data: deal, error: errDeal } = await admin
          .from("deals")
          .insert({
            company_id: empresaDoNegocio,
            linkedin_url: null,
            account_id: p.accountId,
            user_id: p.userId,
            assigned_to: perfil?.id ?? null,
            pipeline_id: pipelineId,
            stage_id: stageId,
            contact_id: contactId,
            title: titulo,
            notes: descricao,
            value: 0,
            status: "open",
            source: "prospecting",
            external_id: c.id,
          })
          .select("id")
          .single();
        if (errDeal) throw errDeal;
        await admin
          .from("prospecting_candidates")
          .update({ contact_id: contactId, deal_id: deal.id })
          .eq("id", c.id);
        res.imported++;
      } catch (e) {
        console.error("[prospecting.import]", e);
        res.skipped.push({ id: c.id, reason: "Falha inesperada ao importar este item." });
      }
    }
    return res;
  });
}

/**
 * B2B: o lead vira CONTATO, sem negócio e sem funil. Quem tem e-mail verificado
 * já virou contato na revelação (`contact_id`) e conta como "já estava". Quem
 * ficou sem e-mail confirmado nasce aqui, com a base legal da busca e, se a
 * revelação achou um e-mail não confirmado (catch-all), com esse e-mail.
 */
async function importarContatosB2b(
  admin: Admin,
  p: { accountId: string; userId: string; candidateIds: string[] },
): Promise<ResultadoDaImportacao> {
  return comLock(admin, p.accountId, async () => {
    const { data: cands } = await admin
      .from("prospecting_candidates")
      .select("*, prospecting_campaigns!inner(id,name,kind,search)")
      .eq("account_id", p.accountId)
      .eq("prospecting_campaigns.kind", "b2b")
      .in("id", p.candidateIds);

    const res: ResultadoDaImportacao = { imported: 0, already: 0, skipped: [] };
    const achados = new Set((cands ?? []).map((c) => c.id));
    for (const id of p.candidateIds) if (!achados.has(id)) res.skipped.push({ id, reason: "Candidato não encontrado." });

    for (const c of cands ?? []) {
      try {
        if (c.contact_id) {
          res.already++;
          continue;
        }
        const avaliacao = avaliarImportacaoB2b(c);
        if (!avaliacao.ok) {
          res.skipped.push({ id: c.id, reason: avaliacao.motivo });
          continue;
        }
        const camp = c.prospecting_campaigns as { id: string; search: { legal_basis_ref?: string } | null };
        const base = camp.search?.legal_basis_ref ?? null;
        if (!base) {
          res.skipped.push({ id: c.id, reason: "A busca não guardou a base legal (legítimo interesse) deste lead." });
          continue;
        }
        const contactId = await criarContatoB2b(
          admin,
          { campaignId: camp.id, accountId: p.accountId, legalBasisRef: base, quemCria: async () => p.userId },
          c.data as Lead,
          emailNaoConfirmado(c.data as Lead),
        );
        if (!contactId) {
          res.skipped.push({ id: c.id, reason: MSG_PEDIU_PARA_SAIR });
          continue;
        }
        await admin.from("prospecting_candidates").update({ contact_id: contactId }).eq("id", c.id);
        res.imported++;
      } catch (e) {
        console.error("[prospecting.import]", e);
        res.skipped.push({ id: c.id, reason: "Falha inesperada ao importar este item." });
      }
    }
    return res;
  });
}
