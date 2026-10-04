import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { LIMIAR_LEAD_QUENTE } from "@/lib/cadencias/vocabulario";
import { ehLeadQuenteNovo } from "@/lib/cadencias/hot-leads";

export const dynamic = "force-dynamic";

// Normaliza embed do PostgREST (objeto OU array conforme versão).
const primeiro = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 100));
    // Sessão do usuário: a RLS decide o que cada papel enxerga.
    const { data, error } = await ctx.supabase
      .from("email_cadence_enrollments")
      .select(
        "id,cadence_id,deal_id,status,aberturas,primeira_abertura_em,ultima_abertura_em, email_cadences(name), deals(title,status,assigned_to,pipeline_id), contacts(name)",
      )
      .gte("aberturas", LIMIAR_LEAD_QUENTE)
      .order("aberturas", { ascending: false })
      .order("ultima_abertura_em", { ascending: false })
      .limit(limit);
    if (error) return fail("db_error", error.message, 500);

    // Última visita à página, para marcar os novos. Falha aqui (ex.: migration
    // 037 não aplicada) só desliga a marcação, não a lista.
    const { data: perfil, error: perfilErr } = await ctx.supabase
      .from("profiles")
      .select("hot_leads_vistos_em")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (perfilErr) console.error("[hot-leads]", perfilErr.message);
    const vistosEm = perfilErr ? undefined : ((perfil?.hot_leads_vistos_em as string | null) ?? null);

    const leads = (data ?? []).map((r) => {
      const cad = primeiro(r.email_cadences as { name: string } | { name: string }[] | null);
      const deal = primeiro(
        r.deals as
          | { title: string; status: string; assigned_to: string | null; pipeline_id: string }
          | { title: string; status: string; assigned_to: string | null; pipeline_id: string }[]
          | null,
      );
      const contato = primeiro(r.contacts as { name: string | null } | { name: string | null }[] | null);
      return {
        enrollment_id: r.id,
        cadence_id: r.cadence_id,
        cadence_name: cad?.name ?? null,
        deal_id: r.deal_id,
        deal_title: deal?.title ?? null,
        deal_status: deal?.status ?? null,
        pipeline_id: deal?.pipeline_id ?? null,
        contact_name: contato?.name ?? null,
        aberturas: r.aberturas,
        primeira_abertura_em: r.primeira_abertura_em,
        ultima_abertura_em: r.ultima_abertura_em,
        inscricao_status: r.status,
        novo: vistosEm !== undefined && ehLeadQuenteNovo(r.ultima_abertura_em, vistosEm),
      };
    });
    return json({ leads, total: leads.length });
  } catch (e) {
    return toErrorResponse(e);
  }
}
