import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { modoDisponivel } from "@/lib/ia/modo-analisar-deals";
import { CONFIG_PADRAO, configSchema, normalizarConfig } from "@/lib/pipeline/config";

export const dynamic = "force-dynamic";

/** Pesos e limites da conta (Configurações → IA) e que IA está disponível. Agent+ lê; só admin+ grava. */
export async function GET() {
  try {
    const ctx = await requireRole("agent");
    const { data, error } = await ctx.supabase
      .from("analisar_deals_config")
      .select("config")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (error) return fail("db_error", "Não foi possível carregar a configuração.", 500);
    const modo = await modoDisponivel(supabaseAdmin(), ctx.accountId);
    return json({ config: data ? normalizarConfig(data.config) : CONFIG_PADRAO, ia: { modo } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const c = configSchema.safeParse(await request.json().catch(() => null));
    if (!c.success) return validationFailed(c.error);
    // sessão do usuário: a RLS de `analisar_deals_config` só deixa admin+ gravar
    const { error } = await ctx.supabase
      .from("analisar_deals_config")
      .upsert({ account_id: ctx.accountId, config: c.data, updated_by: ctx.userId }, { onConflict: "account_id" });
    if (error) return fail("db_error", "Não foi possível salvar a configuração.", 500);
    return json({ config: normalizarConfig(c.data) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
