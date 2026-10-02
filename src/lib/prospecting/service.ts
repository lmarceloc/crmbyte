import type { SupabaseClient } from "@supabase/supabase-js";
import * as apify from "./apify";
import { ProspectingError } from "./errors";
import { comLock } from "./locks";
import type { B2bSearchInput } from "./schemas";
import { buscarPessoas } from "./treg";
import { obterChave, salvarChave } from "@/lib/integracoes/chaves";

type Admin = SupabaseClient;

export const mensagemGenerica =
  "Não foi possível concluir a operação. Verifique a configuração e tente novamente.";

// ---------- Apify: credencial por conta

export async function chaveApify(admin: Admin, accountId: string): Promise<string> {
  const chave = await obterChave(admin, accountId, "apify");
  if (!chave) throw new ProspectingError("Cadastre a chave do Apify em Configurações → Chaves de API.", 422);
  return chave;
}

export async function configurarChave(admin: Admin, accountId: string, userId: string, apiKey: string) {
  await apify.validarChave(apiKey); // recusa ANTES de salvar
  try {
    await salvarChave(admin, accountId, userId, "apify", apiKey);
  } catch {
    throw new ProspectingError(mensagemGenerica, 500);
  }
}

// ---------- campanha (idempotente por request_id)

async function campanhaExistente(admin: Admin, accountId: string, requestId: string) {
  const { data } = await admin
    .from("prospecting_campaigns")
    .select("*")
    .eq("account_id", accountId)
    .eq("request_id", requestId)
    .maybeSingle();
  return data;
}

const MSG_ABERTURA_INCERTA =
  "Não foi possível confirmar a busca. Confira as execuções no provedor antes de repetir.";

export async function criarBuscaSimples(
  admin: Admin,
  accountId: string,
  userId: string,
  requestId: string,
  search: { name: string; niche: string; location: string; limit: number; budget_usd: number; enrich: boolean },
) {
  return comLock(admin, accountId, async () => {
    const existente = await campanhaExistente(admin, accountId, requestId);
    if (existente) return existente;
    const key = await chaveApify(admin, accountId);
    const { data: camp, error } = await admin
      .from("prospecting_campaigns")
      .insert({
        account_id: accountId,
        created_by: userId,
        request_id: requestId,
        name: search.name,
        search,
        kind: "simples",
        search_status: "starting",
      })
      .select("*")
      .single();
    if (error || !camp) throw new ProspectingError(mensagemGenerica, 500);
    try {
      const run = await apify.iniciarBusca(key, search);
      const { data } = await admin
        .from("prospecting_campaigns")
        .update({ search_status: "running", run_id: run.id, dataset_id: run.defaultDatasetId })
        .eq("id", camp.id)
        .select("*")
        .single();
      return data ?? camp;
    } catch (e) {
      // 401/402 = recusa clara (nada foi iniciado); o resto é AMBÍGUO e nunca se repete sozinho.
      const claro = e instanceof ProspectingError && /inválida|insuficiente/.test(e.message);
      const { data } = await admin
        .from("prospecting_campaigns")
        .update(
          claro
            ? { search_status: "failed", error: (e as Error).message }
            : { search_status: "unknown", error: MSG_ABERTURA_INCERTA },
        )
        .eq("id", camp.id)
        .select("*")
        .single();
      return data ?? camp;
    }
  });
}

export async function criarBuscaB2b(
  admin: Admin,
  accountId: string,
  userId: string,
  input: B2bSearchInput,
) {
  return comLock(admin, accountId, async () => {
    const existente = await campanhaExistente(admin, accountId, input.request_id);
    if (existente) return existente;
    const tregChave = await obterChave(admin, accountId, "treg");
    if (!tregChave) throw new ProspectingError("Cadastre a chave da Treg em Configurações → Chaves de API.", 422);

    const { data: camp, error } = await admin
      .from("prospecting_campaigns")
      .insert({
        account_id: accountId,
        created_by: userId,
        request_id: input.request_id,
        name: input.search.name,
        search: input.search,
        kind: "b2b",
        search_status: "running",
      })
      .select("*")
      .single();
    if (error || !camp) throw new ProspectingError(mensagemGenerica, 500);

    try {
      const { leads, custoUsd } = await buscarPessoas(
        tregChave,
        { limit: input.search.limit, title: input.search.title, company_domain: input.search.company_domain },
        input.search.budget_usd,
      );
      let inseridos = 0;
      for (const lead of leads) {
        const { error: e } = await admin.from("prospecting_candidates").insert({
          account_id: accountId,
          campaign_id: camp.id,
          place_id: lead.key,
          data: lead,
          status: "new",
        });
        if (!e) inseridos++;
        else if (e.code !== "23505") throw e;
      }
      const { data } = await admin
        .from("prospecting_campaigns")
        .update({
          search_status: "succeeded",
          cost_usd: custoUsd,
          result_count: inseridos,
          skipped_count: leads.length - inseridos,
        })
        .eq("id", camp.id)
        .select("*")
        .single();
      return data ?? camp;
    } catch (e) {
      const msg = e instanceof ProspectingError ? e.message : mensagemGenerica;
      if (!(e instanceof ProspectingError)) console.error("[prospecting.b2b]", e);
      // ⚠️ HTTP 200 com a campanha em `failed`: o chamador olha search_status.
      const { data } = await admin
        .from("prospecting_campaigns")
        .update({ search_status: "failed", error: msg })
        .eq("id", camp.id)
        .select("*")
        .single();
      return data ?? camp;
    }
  });
}

// ---------- leitura (telas)

export async function listarProspeccao(admin: Admin, accountId: string, kind: "simples" | "b2b") {
  const [{ data: campaigns }, { data: candidates }, { data: pipelines }] = await Promise.all([
    admin
      .from("prospecting_campaigns")
      .select("*")
      .eq("account_id", accountId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("prospecting_candidates")
      .select("*, prospecting_campaigns!inner(kind), deals:deal_id(pipeline_id)")
      .eq("account_id", accountId)
      .eq("prospecting_campaigns.kind", kind)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("pipelines").select("id,name,pipeline_stages(id,name,position)").eq("account_id", accountId),
  ]);
  const stages = (pipelines ?? []).flatMap((p) =>
    ((p.pipeline_stages as { id: string; name: string; position: number }[]) ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      pipeline_id: p.id as string,
      pipeline_name: p.name as string,
    })),
  );
  return {
    campaigns: campaigns ?? [],
    candidates: (candidates ?? []).map((c) => {
      const { prospecting_campaigns: _kind, ...resto } = c;
      void _kind;
      return resto;
    }),
    pipelines: (pipelines ?? []).map((p) => ({ id: p.id as string, name: p.name as string })),
    stages,
  };
}

export async function temChaveApify(admin: Admin, accountId: string): Promise<boolean> {
  return !!(await obterChave(admin, accountId, "apify"));
}
