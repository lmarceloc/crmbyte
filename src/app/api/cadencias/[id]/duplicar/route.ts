import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { nomeDaCopia } from "@/lib/cadencias/duplicar";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Duplica a cadência: mesmos passos, caixas soltas e configuração, como rascunho
 * (desligada) e sem inscrições — os leads da original não vêm junto.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const { data: original } = await admin
      .from("email_cadences")
      .select("name,configuracao,passos,soltos")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!original) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);

    const { data, error } = await admin
      .from("email_cadences")
      .insert({
        account_id: ctx.accountId,
        name: nomeDaCopia(original.name),
        status: "rascunho",
        configuracao: original.configuracao,
        passos: original.passos,
        soltos: original.soltos ?? [],
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) return fail("db_error", error.message, 500);
    return json({ cadencia: data }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
