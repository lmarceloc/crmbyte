import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { escolherFunilEEtapa, tituloDoNegocio } from "@/lib/cadencias/negocio-da-inscricao";
import { criarNegocioDaInscricaoSchema } from "@/lib/cadencias/schemas";
import { configuracaoPadrao, type ConfiguracaoDaCadencia } from "@/lib/cadencias/tipos";

export const dynamic = "force-dynamic";

const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * Cria o negócio de um inscrito que entrou na cadência sem negócio e o põe no
 * pipeline. A cadência continua rodando; o histórico (eventos e tarefas) da
 * inscrição passa a aparecer no negócio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; inscricaoId: string }> },
) {
  try {
    const { id, inscricaoId } = await params;
    const ctx = await requireRole("agent");
    const corpo = criarNegocioDaInscricaoSchema.safeParse(await request.json().catch(() => ({})));
    if (!corpo.success) return validationFailed(corpo.error);
    const admin = supabaseAdmin();

    const { data: insc } = await admin
      .from("email_cadence_enrollments")
      .select("id,deal_id,contact_id, email_cadences(configuracao), contacts(name,company_id, companies(name))")
      .eq("id", inscricaoId)
      .eq("cadence_id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!insc) return fail("inscricao_nao_encontrada", "Inscrição não encontrada.", 404);
    if (insc.deal_id) return fail("inscricao_ja_tem_negocio", "Este inscrito já tem negócio.", 409);

    const cfg: ConfiguracaoDaCadencia = {
      ...configuracaoPadrao(),
      ...((um(insc.email_cadences as { configuracao: object } | { configuracao: object }[] | null)?.configuracao ??
        {}) as object),
    };
    type Contato = { name: string | null; company_id: string | null; companies: { name: string } | { name: string }[] | null };
    const contato = um(insc.contacts as Contato | Contato[] | null);

    const { data: funis } = await admin
      .from("pipelines")
      .select("id, pipeline_stages(id,position)")
      .eq("account_id", ctx.accountId)
      .order("created_at");
    const escolha = escolherFunilEEtapa(
      { pipelineId: corpo.data.pipeline_id, stageId: corpo.data.stage_id },
      cfg.negocio ?? { pipelineId: null, stageId: null },
      (funis ?? []).map((f) => ({
        id: f.id as string,
        etapas: (f.pipeline_stages ?? []) as { id: string; position: number }[],
      })),
    );
    if (!escolha) return fail("sem_funil", "A conta não tem funil com etapas. Crie um em Pipelines.", 409);

    const { data: conta } = await admin
      .from("accounts")
      .select("default_currency")
      .eq("id", ctx.accountId)
      .maybeSingle();
    const { data: deal, error } = await admin
      .from("deals")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        pipeline_id: escolha.pipelineId,
        stage_id: escolha.stageId,
        contact_id: insc.contact_id, // trigger da 027 espelha em deal_contacts (principal)
        company_id: contato?.company_id ?? null,
        title: corpo.data.title ?? tituloDoNegocio(contato?.name, um(contato?.companies)?.name),
        value: 0,
        ...(conta?.default_currency ? { currency: conta.default_currency } : {}),
        status: "open",
      })
      .select("id,title,pipeline_id")
      .single();
    if (error || !deal) return fail("db_error", error?.message ?? "Falha ao criar o negócio.", 500);

    // Só amarra se ninguém amarrou antes (dois cliques simultâneos): senão desfaz.
    const { data: amarrada } = await admin
      .from("email_cadence_enrollments")
      .update({ deal_id: deal.id })
      .eq("id", inscricaoId)
      .eq("account_id", ctx.accountId)
      .is("deal_id", null)
      .select("id")
      .maybeSingle();
    if (!amarrada) {
      await admin.from("deals").delete().eq("id", deal.id).eq("account_id", ctx.accountId);
      return fail("inscricao_ja_tem_negocio", "Este inscrito já tem negócio.", 409);
    }

    // O histórico da inscrição passa a aparecer no negócio.
    await Promise.all([
      admin
        .from("email_cadence_events")
        .update({ deal_id: deal.id })
        .eq("enrollment_id", inscricaoId)
        .eq("account_id", ctx.accountId)
        .is("deal_id", null),
      admin
        .from("tarefas")
        .update({ deal_id: deal.id })
        .eq("enrollment_id", inscricaoId)
        .eq("account_id", ctx.accountId)
        .is("deal_id", null),
    ]);
    await admin.from("email_cadence_events").insert({
      account_id: ctx.accountId,
      cadence_id: id,
      enrollment_id: inscricaoId,
      deal_id: deal.id,
      tipo: "negocio_criado",
      ator_user_id: ctx.userId,
    });
    return json({ negocio: deal }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
