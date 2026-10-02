import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { ProspectingError } from "@/lib/prospecting/errors";
import { b2bSearchSchema } from "@/lib/prospecting/schemas";
import { criarBuscaB2b, listarProspeccao, mensagemGenerica } from "@/lib/prospecting/service";
import { tregKey } from "@/lib/prospecting/treg";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a busca é síncrona

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const lista = await listarProspeccao(supabaseAdmin(), ctx.accountId, "b2b");
    return json({ configured: !!tregKey(), ...lista });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const corpo = b2bSearchSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const campanha = await criarBuscaB2b(supabaseAdmin(), ctx.accountId, ctx.userId, corpo.data);
    return json({ campaign: campanha });
  } catch (e) {
    if (e instanceof ProspectingError) return fail("prospecting_unavailable", e.message, e.status);
    console.error("[prospecting.b2b.POST]", e);
    return fail("prospecting_unavailable", mensagemGenerica, 500);
  }
}
