import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

const primeiro = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * GET /api/hot-leads/novos — quantos leads quentes tiveram abertura desde a
 * última visita do usuário à página, e o mais recente (texto da notificação).
 */
export async function GET() {
  try {
    const ctx = await requireRole("agent");
    const { data: perfil, error: perfilErr } = await ctx.supabase
      .from("profiles")
      .select("hot_leads_vistos_em")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (perfilErr) {
      // Ex.: migration 037 ainda não aplicada — sem notificação, sem quebrar o menu.
      console.error("[hot-leads/novos]", perfilErr.message);
      return json({ novos: 0, ultimo: null });
    }
    const vistosEm = (perfil?.hot_leads_vistos_em as string | null) ?? null;

    let q = ctx.supabase
      .from("email_cadence_enrollments")
      .select("id,aberturas,ultima_abertura_em, deals(title), contacts(name)", { count: "exact" })
      .not("quente_em", "is", null) // limite de cada cadência (migração 043)
      .not("ultima_abertura_em", "is", null)
      .order("ultima_abertura_em", { ascending: false })
      .limit(1);
    if (vistosEm) q = q.gt("ultima_abertura_em", vistosEm);
    const { data, count, error } = await q;
    if (error) return fail("db_error", error.message, 500);

    const r = data?.[0];
    const ultimo = r
      ? {
          enrollment_id: r.id as string,
          deal_title: primeiro(r.deals as { title: string } | { title: string }[] | null)?.title ?? null,
          contact_name: primeiro(r.contacts as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
          aberturas: r.aberturas as number,
          ultima_abertura_em: r.ultima_abertura_em as string,
        }
      : null;
    return json({ novos: count ?? 0, ultimo });
  } catch (e) {
    return toErrorResponse(e);
  }
}
