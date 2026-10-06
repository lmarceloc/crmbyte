import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { ocupacaoEmOutraCadencia, textoDaOcupacao } from "@/lib/cadencias/inscricao-do-negocio";
import { inscricoesAtivasEmOutras } from "@/lib/cadencias/ocupacao";
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
      .select("id,status,company_id")
      .eq("id", corpo.data.deal_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!deal) return fail("cadencia_lead_indisponivel", "Negócio não encontrado.", 409);
    if (deal.status !== "open")
      return fail("cadencia_lead_indisponivel", "Só negócios em aberto podem entrar numa cadência.", 409);

    // Contatos do negócio (um específico, ou todos que tenham e-mail).
    let qc = admin
      .from("deal_contacts")
      .select("contact_id, contacts(email,email_unsubscribed_at)")
      .eq("deal_id", deal.id)
      .eq("account_id", ctx.accountId);
    if (corpo.data.contact_id) qc = qc.eq("contact_id", corpo.data.contact_id);
    const { data: vinculos } = await qc;
    type C = { email: string | null; email_unsubscribed_at: string | null };
    const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    const todos = (vinculos ?? []).map((v) => ({ id: v.contact_id as string, c: um(v.contacts as C | C[] | null) }));
    if (todos.length === 0)
      return fail("cadencia_lead_indisponivel", "Este negócio não tem contatos. Adicione um contato ao negócio.", 409);
    const elegiveis = todos.filter((t) => t.c?.email?.trim() && !t.c.email_unsubscribed_at);
    if (elegiveis.length === 0)
      return fail(
        "cadencia_lead_indisponivel",
        "Nenhum contato do negócio pode receber e-mail (sem e-mail ou descadastrado).",
        409,
      );

    // Um lead fica numa cadência por vez: negócio, empresa ou contato já ativo em outra = recusa.
    const ativas = await inscricoesAtivasEmOutras(
      admin,
      id,
      {
        dealIds: [deal.id],
        contactIds: elegiveis.map((t) => t.id),
        companyIds: deal.company_id ? [deal.company_id as string] : [],
      },
      ctx.accountId,
    );
    const ocupacao = ocupacaoEmOutraCadencia(
      { id: deal.id, company_id: (deal.company_id as string | null) ?? null, contatos: elegiveis.map((t) => t.id) },
      ativas,
    );
    if (ocupacao)
      return fail(
        "cadencia_lead_indisponivel",
        `${textoDaOcupacao(ocupacao)} Um lead fica em uma cadência por vez: pare a outra inscrição antes.`,
        409,
      );

    const { data: novas, error } = await admin
      .from("email_cadence_enrollments")
      .upsert(
        elegiveis.map((t) => ({
          account_id: ctx.accountId,
          cadence_id: id,
          deal_id: deal.id,
          contact_id: t.id,
          origem: "manual",
          inscrito_por: ctx.userId,
        })),
        { onConflict: "cadence_id,deal_id,contact_id", ignoreDuplicates: true },
      )
      .select("*");
    if (error) return fail("db_error", error.message, 500);
    if (!novas?.length)
      return fail("cadencia_inscricao_existente", "Os contatos deste negócio já estão nesta cadência.", 409);
    await admin.from("email_cadence_events").insert(
      novas.map((n) => ({
        account_id: ctx.accountId,
        cadence_id: id,
        enrollment_id: n.id,
        deal_id: deal.id,
        tipo: "inscrito",
        ator_user_id: ctx.userId,
      })),
    );
    return json(
      { inscricoes: novas, inscritos: novas.length, ignorados: todos.length - novas.length },
      201,
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
