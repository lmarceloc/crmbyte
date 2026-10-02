import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

const schema = z
  .object({ resultado: z.enum(["com_interesse", "sem_interesse", "agendado"]).nullable() })
  .strict();

/**
 * Marca o resultado do lead na cadência. "Sem interesse" e "agendado" encerram
 * a sequência (motivo `manual`) para o lead não receber mais e-mails;
 * "com interesse" mantém a cadência rodando.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; inscricaoId: string }> },
) {
  try {
    const { id, inscricaoId } = await params;
    const ctx = await requireRole("agent");
    const corpo = schema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const admin = supabaseAdmin();

    const { data: insc } = await admin
      .from("email_cadence_enrollments")
      .select("id,cadence_id,deal_id,status")
      .eq("id", inscricaoId)
      .eq("cadence_id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!insc) return fail("inscricao_nao_encontrada", "Inscrição não encontrada.", 404);

    const { resultado } = corpo.data;
    const agora = new Date().toISOString();
    const encerra = (resultado === "sem_interesse" || resultado === "agendado") && insc.status === "ativa";
    const { data, error } = await admin
      .from("email_cadence_enrollments")
      .update({
        resultado,
        resultado_em: resultado ? agora : null,
        resultado_por: resultado ? ctx.userId : null,
        ...(encerra
          ? { status: "parada", motivo_parada: "manual", parada_em: agora, processando_ate: null }
          : {}),
      })
      .eq("id", inscricaoId)
      .eq("account_id", ctx.accountId)
      .select("id,resultado,resultado_em,status,motivo_parada")
      .single();
    if (error) return fail("db_error", error.message, 500);

    await admin.from("email_cadence_events").insert({
      account_id: ctx.accountId,
      cadence_id: id,
      enrollment_id: inscricaoId,
      deal_id: insc.deal_id,
      tipo: "resultado_marcado",
      ator_user_id: ctx.userId,
      metadata: { resultado },
    });
    return json({ inscricao: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}
