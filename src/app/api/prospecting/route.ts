import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { ProspectingError } from "@/lib/prospecting/errors";
import { prospectingActionSchema } from "@/lib/prospecting/schemas";
import {
  configurarChave,
  criarBuscaSimples,
  listarProspeccao,
  mensagemGenerica,
  temChaveApify,
} from "@/lib/prospecting/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const [configured, lista] = await Promise.all([
      temChaveApify(admin, ctx.accountId),
      listarProspeccao(admin, ctx.accountId, "simples"),
    ]);
    return json({ configured, ...lista });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const corpo = prospectingActionSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const admin = supabaseAdmin();
    if (corpo.data.action === "configure") {
      await configurarChave(admin, ctx.accountId, ctx.userId, corpo.data.api_key);
      return json({ configured: true });
    }
    const campanha = await criarBuscaSimples(admin, ctx.accountId, ctx.userId, corpo.data.request_id, corpo.data.search);
    return json({ campaign: campanha });
  } catch (e) {
    if (e instanceof ProspectingError) return fail("prospecting_unavailable", e.message, e.status);
    console.error("[prospecting.POST]", e);
    return fail("prospecting_unavailable", mensagemGenerica, 500);
  }
}
