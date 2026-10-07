import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { autenticarChaveApi } from "@/lib/integracoes/api-keys";
import { importarContatos, pedidoSchema, resumir } from "@/lib/integracoes/importar-contatos";

export const dynamic = "force-dynamic";

// Entrada de contatos + empresa por sistemas externos (n8n, Apollo...).
// Autentica por `Authorization: Bearer wacrm_…` (ou `X-Api-Key`); a chave define a conta.
export async function POST(request: Request) {
  try {
    const admin = supabaseAdmin();
    const conta = await autenticarChaveApi(admin, request.headers);
    if (!conta) return fail("unauthorized", "Chave de API ausente, inválida ou revogada.", 401);

    const p = pedidoSchema.safeParse(await request.json().catch(() => null));
    if (!p.success) return validationFailed(p.error);

    const resultados = await importarContatos(admin, conta, p.data.source, p.data.contatos);
    return json({ resumo: resumir(resultados), resultados });
  } catch (e) {
    return toErrorResponse(e);
  }
}
