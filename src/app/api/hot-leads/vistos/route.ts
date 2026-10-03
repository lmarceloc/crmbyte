import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

// POST /api/hot-leads/vistos — o usuário abriu a página: zera o selo de novos.
export async function POST() {
  try {
    const ctx = await requireRole("agent");
    const { error } = await ctx.supabase
      .from("profiles")
      .update({ hot_leads_vistos_em: new Date().toISOString() })
      .eq("user_id", ctx.userId);
    if (error) return fail("db_error", error.message, 500);
    return json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
