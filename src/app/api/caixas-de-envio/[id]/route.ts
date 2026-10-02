import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { CaixaError, removerCaixa } from "@/lib/email/caixas";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("validation_failed", "Id inválido.", 422);
    const ctx = await requireRole("admin");
    await removerCaixa(supabaseAdmin(), ctx.accountId, id);
    return json({ deleted: true });
  } catch (e) {
    if (e instanceof CaixaError) return fail("mailbox_invalid", e.message, e.status);
    return toErrorResponse(e);
  }
}
