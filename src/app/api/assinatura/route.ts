import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { avaliarAcesso } from "@/lib/assinatura/acesso";
import { AbacatePayError, chaveConfigurada, criarCheckoutDeAssinatura, PRECO_CENTAVOS } from "@/lib/assinatura/abacatepay";

export const dynamic = "force-dynamic";

/** Estado da assinatura da conta (qualquer membro vê). */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase
      .from("conta_assinatura")
      .select(
        "status,metodo,valor_centavos,ativa_desde,ultimo_pagamento_em,cancelada_em,abacate_customer_id,abacate_checkout_id,teste_ate,isenta",
      )
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (error) return fail("db_error", error.message, 500);
    return json({
      assinatura: {
        status: data?.status ?? "sem_assinatura",
        metodo: data?.metodo ?? null,
        valor_centavos: data?.valor_centavos ?? PRECO_CENTAVOS,
        ativa_desde: data?.ativa_desde ?? null,
        ultimo_pagamento_em: data?.ultimo_pagamento_em ?? null,
        cancelada_em: data?.cancelada_em ?? null,
        tem_portal: !!(data?.abacate_customer_id && data?.abacate_checkout_id),
        teste_ate: data?.teste_ate ?? null,
        isenta: data?.isenta ?? false,
      },
      acesso: avaliarAcesso(data ?? null),
      preco_centavos: PRECO_CENTAVOS,
      pagamento_configurado: !!chaveConfigurada(),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Cria o checkout de assinatura na AbacatePay e devolve a URL de pagamento (admin+). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const { data: atual } = await admin
      .from("conta_assinatura")
      .select("status")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (atual?.status === "ativa") return fail("ja_assinante", "A assinatura desta conta já está ativa.", 409);

    const checkout = await criarCheckoutDeAssinatura({
      accountId: ctx.accountId,
      userId: ctx.userId,
      origem: process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin,
    });
    const { error } = await admin.from("conta_assinatura").upsert(
      {
        account_id: ctx.accountId,
        // "pagamento_falhou"/"cancelada" continuam visíveis até o webhook confirmar o novo pagamento
        ...(!atual || atual.status === "sem_assinatura" ? { status: "pendente" } : {}),
        abacate_checkout_id: checkout.id,
        abacate_checkout_url: checkout.url,
        dev_mode: checkout.devMode,
      },
      { onConflict: "account_id" },
    );
    if (error) return fail("db_error", error.message, 500);
    return json({ url: checkout.url });
  } catch (e) {
    if (e instanceof AbacatePayError) return fail("abacatepay", e.message, 502);
    return toErrorResponse(e);
  }
}
