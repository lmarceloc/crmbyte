import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

// POST /api/tarefas/vistas — o usuário abriu o sininho: marca as notificações como vistas.
export async function POST() {
  try {
    const ctx = await requireRole("viewer");
    const { error } = await ctx.supabase
      .from("tarefas")
      .update({ vista_em: new Date().toISOString() })
      .eq("responsavel_id", ctx.userId)
      .is("vista_em", null);
    if (error) return fail("db_error", error.message, 500);
    return json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
