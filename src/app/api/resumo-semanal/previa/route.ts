import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { enviarResumoDaConta } from "@/lib/resumo-semanal/envio";
import { semanaAnterior } from "@/lib/resumo-semanal/periodo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prévia: manda o resumo da última semana fechada só para quem pediu (admin+). */
export async function POST() {
  try {
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const { data: perfil } = await admin.from("profiles").select("email").eq("user_id", ctx.userId).maybeSingle();
    const email = (perfil?.email as string | null)?.trim();
    if (!email) return fail("sem_email", "Seu perfil não tem e-mail.", 409);
    const r = await enviarResumoDaConta(admin, ctx.accountId, semanaAnterior(new Date()), [email]);
    if (r.enviados === 0) return fail("envio_falhou", r.falhas[0] ?? "Não foi possível enviar.", 502);
    return json({ enviadoPara: email });
  } catch (e) {
    return toErrorResponse(e);
  }
}
