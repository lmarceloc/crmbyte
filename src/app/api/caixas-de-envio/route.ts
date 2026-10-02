import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { CaixaError, caixaInputSchema, listarCaixas, salvarCaixa } from "@/lib/email/caixas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    return json({ caixas: await listarCaixas(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    if (e instanceof CaixaError) return fail("mailbox_invalid", e.message, e.status);
    return toErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const corpo = caixaInputSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const r = await salvarCaixa(supabaseAdmin(), ctx.accountId, ctx.userId, corpo.data);
    return json({ caixa: r.caixa }, r.criada ? 201 : 200);
  } catch (e) {
    if (e instanceof CaixaError) return fail("mailbox_invalid", e.message, e.status);
    return toErrorResponse(e);
  }
}
