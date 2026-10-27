import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { AbacatePayError, criarLinkDoPortal } from "@/lib/assinatura/abacatepay";

export const dynamic = "force-dynamic";

/** Link do portal do cliente da AbacatePay: cartão, pagamentos e cancelamento (admin+). */
export async function POST() {
  try {
    const ctx = await requireRole("admin");
    const { data } = await supabaseAdmin()
      .from("conta_assinatura")
      .select("abacate_customer_id,abacate_checkout_id")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!data?.abacate_customer_id || !data.abacate_checkout_id)
      return fail("sem_assinatura", "Esta conta ainda não tem uma assinatura paga.", 404);
    return json({ url: await criarLinkDoPortal(data.abacate_customer_id, data.abacate_checkout_id) });
  } catch (e) {
    if (e instanceof AbacatePayError) return fail("abacatepay", e.message, 502);
    return toErrorResponse(e);
  }
}
