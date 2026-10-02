// "Importar para o funil": candidato → Contato + Negócio, sem disparar abordagem.
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterOuCriarEmpresa } from "@/lib/companies";
import { findExistingContact, isUniqueViolation } from "@/lib/contacts/dedupe";
import type { Prospect } from "./apify";
import { ProspectingError } from "./errors";
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

export function descricaoB2b(campanha: string, l: Lead): string {
  return [
    `Origem: Prospecção B2B — ${campanha}`,
    l.title && `Cargo: ${l.title}`,
    l.companyName && `Empresa: ${l.companyName}`,
    l.companyDomain && `Domínio: ${l.companyDomain}`,
    l.location && `Local: ${l.location}`,
    l.email && `E-mail: ${l.email}`,
    l.linkedin && `LinkedIn: ${l.linkedin}`,
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
    pipelineId: string;
    stageId: string;
    legalBasisRef?: string;
  },
): Promise<ResultadoDaImportacao> {
  if (p.kind === "simples" && !p.legalBasisRef)
    throw new ProspectingError("Informe a referência do legítimo interesse (LGPD).", 422);

  return comLock(admin, p.accountId, async () => {
    // etapa precisa ser DESTE pipeline e o pipeline desta conta
    const { data: etapa } = await admin
      .from("pipeline_stages")
      .select("id, pipelines!inner(id, account_id)")
      .eq("id", p.stageId)
      .eq("pipeline_id", p.pipelineId)
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
      .select("*, prospecting_campaigns!inner(id,name,kind)")
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
        const camp = c.prospecting_campaigns as { id: string; name: string };
        let contactId: string | null = c.contact_id;

        if (p.kind === "b2b") {
          if (!contactId) {
            res.skipped.push({ id: c.id, reason: "Só leads com e-mail verificado vão para o funil." });
            continue;
          }
        } else {
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
                // corrida: outro processo criou o mesmo telefone
                contactId = (await findExistingContact(admin, p.accountId, c.phone))?.id ?? null;
              } else contactId = novo.id;
            }
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
          res.skipped.push({ id: c.id, reason: "Este contato pediu para não ser contatado." });
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
              .eq("pipeline_id", p.pipelineId)
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

        const titulo =
          p.kind === "b2b"
            ? cortar(`${(c.data as Lead).fullName}${(c.data as Lead).companyName ? ` · ${(c.data as Lead).companyName}` : ""}`, 200)
            : cortar((c.data as Prospect).name, 200);
        const descricao = cortar(
          p.kind === "b2b" ? descricaoB2b(camp.name, c.data as Lead) : descricaoSimples(camp.name, c.data as Prospect),
          2000,
        );
        const empresaDoNegocio =
          p.kind === "b2b"
            ? await obterOuCriarEmpresa(admin, p.accountId, p.userId, {
                nome: (c.data as Lead).companyName,
                website: (c.data as Lead).companyDomain ? `https://${(c.data as Lead).companyDomain}` : null,
              })
            : await obterOuCriarEmpresa(admin, p.accountId, p.userId, {
                nome: (c.data as Prospect).name,
                website: (c.data as Prospect).website,
              });
        const { data: deal, error: errDeal } = await admin
          .from("deals")
          .insert({
            company_id: empresaDoNegocio,
            linkedin_url: p.kind === "b2b" ? ((c.data as Lead).linkedin ?? null) : null,
            account_id: p.accountId,
            user_id: p.userId,
            assigned_to: perfil?.id ?? null,
            pipeline_id: p.pipelineId,
            stage_id: p.stageId,
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
