import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { AbacatePayError, buscarAssinatura } from "@/lib/assinatura/abacatepay";
import { lerEvento, novoStatus, webhookAutentico } from "@/lib/assinatura/webhook";

export const dynamic = "force-dynamic";

/**
 * Webhook da AbacatePay (eventos subscription.*). Cadastrar no painel da AbacatePay com
 * a URL https://<domínio>/api/abacatepay/webhook e o mesmo segredo de ABACATEPAY_WEBHOOK_SECRET.
 * Qualquer 2xx conta como entregue; 5xx faz a AbacatePay tentar de novo.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.text();
  if (
    !webhookAutentico({
      url: request.url,
      headers: request.headers,
      corpo,
      segredo: process.env.ABACATEPAY_WEBHOOK_SECRET,
    })
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const evento = lerEvento(json, request.headers);
  if (!evento) return NextResponse.json({ ok: true, ignorado: "formato" });
  if (!evento.tipo.startsWith("subscription.")) return NextResponse.json({ ok: true, ignorado: evento.tipo });

  const admin = supabaseAdmin();
  if (evento.entregaId) {
    const { data: ja } = await admin
      .from("abacatepay_webhook_eventos")
      .select("id")
      .eq("id", evento.entregaId)
      .maybeSingle();
    if (ja) return NextResponse.json({ ok: true, repetido: true });
  }

  // conta: pelo checkout (metadata/externalId); senão, pela assinatura já gravada
  let accountId = evento.accountId;
  if (!accountId && evento.subscriptionId) {
    const { data } = await admin
      .from("conta_assinatura")
      .select("account_id")
      .eq("abacate_subscription_id", evento.subscriptionId)
      .maybeSingle();
    accountId = data?.account_id ?? null;
  }
  if (!accountId) {
    console.error("[abacatepay-webhook] conta não identificada", evento.tipo, evento.subscriptionId);
    return NextResponse.json({ ok: true, ignorado: "conta_desconhecida" });
  }

  // o estado vem da API, não do corpo: o evento só diz qual assinatura mudou
  let statusNaApi: string | null = null;
  if (evento.subscriptionId) {
    try {
      statusNaApi = (await buscarAssinatura(evento.subscriptionId)).status;
    } catch (e) {
      // chave errada não melhora com retry; rede/instabilidade sim
      if (!(e instanceof AbacatePayError) || !e.deConfiguracao) {
        console.error("[abacatepay-webhook] consulta da assinatura", e);
        return NextResponse.json({ error: "retry" }, { status: 503 });
      }
      console.error("[abacatepay-webhook] chave da AbacatePay", e.message);
    }
  }

  const status = novoStatus(evento.tipo, statusNaApi);
  const agora = new Date().toISOString();
  const { data: atual } = await admin
    .from("conta_assinatura")
    .select("ativa_desde")
    .eq("account_id", accountId)
    .maybeSingle();
  const { error } = await admin.from("conta_assinatura").upsert(
    {
      account_id: accountId,
      ...(status ? { status } : {}),
      ...(evento.subscriptionId ? { abacate_subscription_id: evento.subscriptionId } : {}),
      ...(evento.customerId ? { abacate_customer_id: evento.customerId } : {}),
      ...(evento.checkoutId ? { abacate_checkout_id: evento.checkoutId } : {}),
      ...(evento.metodo ? { metodo: evento.metodo } : {}),
      ...(evento.valorCentavos !== null ? { valor_centavos: evento.valorCentavos } : {}),
      ...(status === "ativa" && !atual?.ativa_desde ? { ativa_desde: agora } : {}),
      ...(evento.tipo === "subscription.completed" || evento.tipo === "subscription.renewed"
        ? { ultimo_pagamento_em: agora }
        : {}),
      ...(status === "cancelada" ? { cancelada_em: agora } : {}),
      ultimo_evento: evento.tipo,
      dev_mode: evento.devMode,
    },
    { onConflict: "account_id" },
  );
  if (error) {
    console.error("[abacatepay-webhook] gravação", error.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  if (evento.entregaId) {
    await admin
      .from("abacatepay_webhook_eventos")
      .upsert({ id: evento.entregaId, evento: evento.tipo, account_id: accountId }, { onConflict: "id", ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true, status });
}
