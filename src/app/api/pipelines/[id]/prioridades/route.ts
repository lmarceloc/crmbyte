import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { modoDisponivel } from "@/lib/ia/modo-analisar-deals";
import { CONFIG_PADRAO, LIMITES_DA_ANALISE, normalizarConfig } from "@/lib/pipeline/config";
import { EQUILIBRADO, ehCriterio, ehCriterioDeIa } from "@/lib/pipeline/criterios";
import { calcularPrioridades } from "@/lib/pipeline/prioridade";
import { montarSinais, type NegocioBruto } from "@/lib/pipeline/sinais";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tudo o que as regras precisam, numa consulta só (a RLS da sessão decide o que o usuário vê):
 * notas e conversas do contato principal, inscrições em cadências e tarefas do negócio.
 */
const COLUNAS =
  "id,title,value,currency,notes,expected_close_date,temperature,stage_id,stage_entered_at,updated_at,created_at,assigned_to," +
  "stage:pipeline_stages(name),company:companies(name)," +
  "contact:contacts(name,contact_notes(created_at),conversations(last_message_at,last_message_text))," +
  "enrollments:email_cadence_enrollments(aberturas,quente_em,ultimo_email_em,ultima_abertura_em,ultimo_clique_em,respondeu_em,email_cadences(configuracao))," +
  "tarefas(status,concluida_em)";

function lista(valor: string | null): string[] {
  return (valor ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * Sinais dos negócios em aberto do funil para o "Analisar Deals". Com mais de 100 negócios, só os
 * 100 que mais pedem atenção (pelos critérios de regra escolhidos) seguem para a análise; a
 * resposta diz quantos ficaram de fora.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("funil_nao_encontrado", "Funil não encontrado.", 404);
    const ctx = await requireRole("agent");

    const url = new URL(request.url);
    const criterios = lista(url.searchParams.get("criterios"));
    if (!criterios.every(ehCriterio)) return fail("validation_failed", "Critério desconhecido.", 422);
    const etapas = lista(url.searchParams.get("etapas"));
    if (!etapas.every((e) => UUID.test(e))) return fail("validation_failed", "Etapa inválida.", 422);
    const responsavel = url.searchParams.get("responsavel");
    if (responsavel && !UUID.test(responsavel)) return fail("validation_failed", "Responsável inválido.", 422);

    const { data: funil, error: erroFunil } = await ctx.supabase.from("pipelines").select("id").eq("id", id).maybeSingle();
    if (erroFunil) return fail("db_error", erroFunil.message, 500);
    if (!funil) return fail("funil_nao_encontrado", "Funil não encontrado.", 404);

    let consulta = ctx.supabase
      .from("deals")
      .select(COLUNAS, { count: "exact" })
      .eq("pipeline_id", id)
      .or("status.eq.open,status.is.null")
      .order("updated_at", { ascending: true })
      .limit(LIMITES_DA_ANALISE.candidatos);
    if (etapas.length > 0) consulta = consulta.in("stage_id", etapas);
    if (responsavel) consulta = consulta.eq("assigned_to", responsavel);
    const { data, error, count } = await consulta;
    if (error) return fail("db_error", error.message, 500);

    // pesos e limites da conta; sem a tabela (migration 045) ou sem linha, vale o padrão
    const { data: linhaDaConfig, error: erroConfig } = await ctx.supabase
      .from("analisar_deals_config")
      .select("config")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (erroConfig) console.error("[analisar-deals] config:", erroConfig.message);
    const config = erroConfig || !linhaDaConfig ? CONFIG_PADRAO : normalizarConfig(linhaDaConfig.config);

    const agora = new Date();
    let sinais = ((data ?? []) as unknown as NegocioBruto[]).map((n) => montarSinais(n, agora));
    const total = Math.max(count ?? 0, sinais.length);
    if (sinais.length > LIMITES_DA_ANALISE.negocios) {
      // a seleção usa só os critérios de regra (a IA ainda não rodou); sem nenhum escolhido, o equilibrado
      const escolhidos = criterios.filter((c) => !ehCriterioDeIa(c));
      const pelaRegra = escolhidos.length > 0 ? escolhidos : EQUILIBRADO;
      const melhores = calcularPrioridades(sinais, pelaRegra, config)
        .slice(0, LIMITES_DA_ANALISE.negocios)
        .map((i) => i.id);
      const ficam = new Set(melhores);
      sinais = sinais.filter((s) => ficam.has(s.id));
    }

    // que IA está disponível: o serviço da análise, o modelo gratuito (modo reduzido) ou nenhuma
    const modo = await modoDisponivel(supabaseAdmin(), ctx.accountId);

    return json({
      negocios: sinais,
      total,
      analisados: sinais.length,
      ficaram_de_fora: Math.max(0, total - sinais.length),
      limite: LIMITES_DA_ANALISE.negocios,
      config,
      ia: { modo },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
