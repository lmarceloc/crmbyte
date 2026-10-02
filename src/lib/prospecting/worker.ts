// Tick de 1 min das capturas: sincroniza buscas Apify em andamento e revela
// e-mails B2B (poucos por rodada, respeitando o teto de custo).
import type { SupabaseClient } from "@supabase/supabase-js";
import * as apify from "./apify";
import { chaveApify } from "./service";
import { ProspectingError } from "./errors";
import { obterOuCriarEmpresa } from "@/lib/companies";
import { comLock } from "./locks";
import { acharEmail, tregKey, verificarEmail, type Lead } from "./treg";

type Admin = SupabaseClient;

interface Campanha {
  id: string;
  account_id: string;
  created_by: string | null;
  kind: "simples" | "b2b";
  search_status: string;
  run_id: string | null;
  dataset_id: string | null;
  cost_usd: number | null;
  search: { budget_usd?: number; limit?: number; legal_basis_ref?: string };
}

const REVEAL_BATCH = 3;
const CAMPANHAS_POR_RODADA = 2;
const MAX_CONTAS = 20;
const PRAZO_MS = 180_000;

export interface ResultadoDoTick {
  contas: number;
  sincronizadas: number;
  reveladas: number;
}

async function contaOwner(admin: Admin, accountId: string): Promise<string | null> {
  const { data } = await admin.from("accounts").select("owner_user_id").eq("id", accountId).maybeSingle();
  return data?.owner_user_id ?? null;
}

/** Cria (ou reaproveita por e-mail) o contato B2B. Devolve o id ou null se o contato pediu para sair. */
async function contatoB2b(
  admin: Admin,
  camp: { id: string; account_id: string; created_by: string | null; search: { legal_basis_ref?: string } },
  lead: Lead,
  email: string,
): Promise<string | null> {
  const { data: existente } = await admin
    .from("contacts")
    .select("id,email_unsubscribed_at")
    .eq("account_id", camp.account_id)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existente) return existente.email_unsubscribed_at ? null : existente.id;

  const userId = camp.created_by ?? (await contaOwner(admin, camp.account_id));
  if (!userId) throw new Error("Conta sem usuário responsável para criar o contato.");
  const companyId = await obterOuCriarEmpresa(admin, camp.account_id, userId, {
    nome: lead.companyName,
    website: lead.companyDomain ? `https://${lead.companyDomain}` : null,
  });
  const { data, error } = await admin
    .from("contacts")
    .insert({
      account_id: camp.account_id,
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
        campaign_id: camp.id,
        lead_key: lead.key,
        company_name: lead.companyName,
        company_domain: lead.companyDomain,
        location: lead.location,
      },
      consent: { legitimate_interest: { ref: camp.search.legal_basis_ref ?? null } },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function revelarEmails(admin: Admin, camp: Campanha): Promise<number> {
  const budget = Number(camp.search?.budget_usd ?? 1);
  let custo = Number(camp.cost_usd ?? 0);
  let feitos = 0;

  const { data: pendentes } = await admin
    .from("prospecting_candidates")
    .select("id,data")
    .eq("campaign_id", camp.id)
    .eq("account_id", camp.account_id)
    .eq("status", "new")
    .order("created_at")
    .limit(REVEAL_BATCH);

  const pular = (id: string, error: string) =>
    admin.from("prospecting_candidates").update({ status: "skipped", error }).eq("id", id);

  // Teto atingido: marca TODOS os `new` como skipped (tira a busca da fila).
  const encerrarPorTeto = async () => {
    await admin
      .from("prospecting_candidates")
      .update({ status: "skipped", error: "Teto de busca atingido antes de revelar este e-mail." })
      .eq("campaign_id", camp.id)
      .eq("account_id", camp.account_id)
      .eq("status", "new");
  };

  for (const cand of pendentes ?? []) {
    if (custo >= budget) {
      await encerrarPorTeto();
      break;
    }
    const lead = cand.data as Lead;
    if (!lead.companyDomain) {
      await pular(cand.id, "Empresa do lead não identificada; não foi possível localizar e-mail.");
      continue;
    }
    try {
      const achado = await acharEmail(lead.fullName, lead.companyDomain);
      custo += achado.custoUsd;
      let valido = false;
      if (achado.email) {
        const v = await verificarEmail(achado.email);
        custo += v.custoUsd;
        valido = v.valido;
      }
      if (!achado.email || !valido) {
        await pular(cand.id, "Sem e-mail comercial verificado.");
      } else {
        const contactId = await contatoB2b(admin, camp, lead, achado.email);
        if (!contactId) {
          await pular(cand.id, "Este contato pediu para não ser contatado.");
        } else {
          await admin
            .from("prospecting_candidates")
            .update({
              status: "enriched",
              contact_id: contactId,
              data: { ...lead, email: achado.email, emailVerified: true },
            })
            .eq("id", cand.id);
        }
      }
      feitos++;
    } catch (e) {
      // Erro do provedor/contato: marca falha do candidato; a rodada segue.
      await admin
        .from("prospecting_candidates")
        .update({ status: "failed", error: e instanceof ProspectingError ? e.message : "Falha ao revelar o e-mail." })
        .eq("id", cand.id);
      console.error("[prospecting.reveal]", e);
    }
    await admin.from("prospecting_campaigns").update({ cost_usd: custo }).eq("id", camp.id);
    camp.cost_usd = custo;
  }
  // Sem mais `new`? nada a fazer; se estourou o teto no último, garante a saída da fila.
  if (custo >= budget) await encerrarPorTeto();
  return feitos;
}

export async function sincronizarBusca(admin: Admin, camp: Campanha): Promise<void> {
  try {
    const key = await chaveApify(admin, camp.account_id);
    const run = await apify.lerRun(key, camp.run_id as string);
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
      await admin
        .from("prospecting_campaigns")
        .update({ search_status: "failed", error: `A busca terminou com estado ${run.status}.` })
        .eq("id", camp.id);
      return;
    }
    if (run.status !== "SUCCEEDED") return;

    const itens = await apify.lerDataset(key, camp.dataset_id ?? run.defaultDatasetId, Number(camp.search?.limit ?? 100));
    let inseridos = 0;
    for (const bruto of itens) {
      const p = apify.normalizeProspect(bruto);
      if (!p) continue;
      const { error } = await admin.from("prospecting_candidates").insert({
        account_id: camp.account_id,
        campaign_id: camp.id,
        place_id: p.key,
        phone: p.phone,
        data: p,
        status: "new",
      });
      if (!error) inseridos++;
      else if (error.code !== "23505") throw new Error(error.message);
    }
    await admin
      .from("prospecting_campaigns")
      .update({
        search_status: "succeeded",
        cost_usd: run.usageTotalUsd ?? null,
        result_count: inseridos,
        skipped_count: itens.length - inseridos,
        error: null,
      })
      .eq("id", camp.id);
  } catch (e) {
    await admin
      .from("prospecting_campaigns")
      .update({ error: e instanceof ProspectingError ? e.message : "Falha ao consultar a busca." })
      .eq("id", camp.id);
  }
}

export async function processarProspeccao(admin: Admin): Promise<ResultadoDoTick> {
  const inicio = Date.now();
  const r: ResultadoDoTick = { contas: 0, sincronizadas: 0, reveladas: 0 };

  // Buscas sem confirmação há > 2 min viram `unknown` (nunca repete sozinho).
  await admin
    .from("prospecting_campaigns")
    .update({
      search_status: "unknown",
      error: "Busca sem confirmação. Consulte o histórico no provedor antes de repetir.",
    })
    .eq("search_status", "starting")
    .lt("updated_at", new Date(Date.now() - 120_000).toISOString());

  const { data: ativas } = await admin
    .from("prospecting_campaigns")
    .select("*")
    .or(
      "search_status.eq.running,and(kind.eq.b2b,search_status.eq.succeeded,result_count.gt.0)",
    )
    .order("updated_at")
    .limit(200);

  const porConta = new Map<string, Campanha[]>();
  for (const c of ativas ?? []) porConta.set(c.account_id, [...(porConta.get(c.account_id) ?? []), c]);

  for (const [accountId, campanhas] of [...porConta].slice(0, MAX_CONTAS)) {
    if (Date.now() - inicio > PRAZO_MS) break;
    r.contas++;
    try {
      await comLock(
        admin,
        accountId,
        async () => {
          const simples = campanhas.filter((c) => c.kind === "simples" && c.search_status === "running" && c.run_id);
          for (const c of simples.slice(0, CAMPANHAS_POR_RODADA)) {
            await sincronizarBusca(admin, c);
            r.sincronizadas++;
          }
          if (!tregKey()) return;
          const b2b = campanhas.filter((c) => c.kind === "b2b" && c.search_status === "succeeded");
          for (const c of b2b.slice(0, CAMPANHAS_POR_RODADA)) {
            r.reveladas += await revelarEmails(admin, c);
          }
        },
        200,
      );
    } catch (e) {
      // 409 (lock ocupado) é esperado; o resto só loga.
      if (!(e instanceof ProspectingError && e.status === 409)) console.error("[prospecting.tick]", e);
    }
  }
  return r;
}
