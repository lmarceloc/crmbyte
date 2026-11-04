import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { inscreverEmCadencia } from "@/lib/cadencias/inscrever";
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
    const r = await inscreverEmCadencia(supabaseAdmin(), ctx, id, corpo.data);
    if (!r.ok) return fail(r.code, r.message, r.status);
    return json({ inscricoes: r.inscricoes, inscritos: r.inscritos, ignorados: r.ignorados }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
