import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { inscreverNegocioSchema } from "@/lib/cadencias/schemas";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRole("agent");
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 50));
    const { data, error } = await ctx.supabase
      .from("email_cadence_enrollments")
      .select(
        "id,deal_id,contact_id,status,motivo_parada,origem,passo_atual_id,proximo_em,emails_enviados,aberturas,cliques,resultado,concluida_em,parada_em,created_at, deals(title), contacts(name)",
      )
      .eq("cadence_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return fail("db_error", error.message, 500);
    return json({ inscricoes: data ?? [] });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRole("agent");
    const corpo = inscreverNegocioSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const admin = supabaseAdmin();

    const { data: cadencia } = await admin
      .from("email_cadences")
      .select("id,status")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!cadencia) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    if (cadencia.status !== "ativa")
      return fail("cadencia_estado_invalido", "A cadência precisa estar ativa para inscrever.", 409);

    const { data: deal } = await admin
      .from("deals")
      .select("id,contact_id,status")
      .eq("id", corpo.data.deal_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!deal?.contact_id)
      return fail("cadencia_lead_indisponivel", "Negócio não encontrado ou sem contato.", 409);
    if (deal.status !== "open")
      return fail("cadencia_lead_indisponivel", "Só negócios em aberto podem entrar numa cadência.", 409);

    const { data: contato } = await admin
      .from("contacts")
      .select("email,email_unsubscribed_at")
      .eq("id", deal.contact_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!contato?.email?.trim())
      return fail("cadencia_lead_indisponivel", "O contato não tem e-mail.", 409);
    if (contato.email_unsubscribed_at)
      return fail("cadencia_lead_indisponivel", "Este contato pediu para não receber e-mails.", 409);

    const { data, error } = await admin
      .from("email_cadence_enrollments")
      .insert({
        account_id: ctx.accountId,
        cadence_id: id,
        deal_id: deal.id,
        contact_id: deal.contact_id,
        origem: "manual",
        inscrito_por: ctx.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505")
        return fail("cadencia_inscricao_existente", "Este negócio já está nesta cadência.", 409);
      return fail("db_error", error.message, 500);
    }
    await admin.from("email_cadence_events").insert({
      account_id: ctx.accountId,
      cadence_id: id,
      enrollment_id: data.id,
      deal_id: deal.id,
      tipo: "inscrito",
      ator_user_id: ctx.userId,
    });
    return json({ inscricao: data }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
