// Webhooks da AbacatePay para a assinatura do CRM (funções puras: testáveis sem rede).
//
// Origem: a AbacatePay manda o segredo do webhook de dois jeitos, conforme a data
// em que o webhook foi criado no painel dela:
//   * legado: `?webhookSecret=<segredo>` na URL (é o que prova a origem);
//   * Standard Webhooks: cabeçalhos webhook-id / webhook-timestamp / webhook-signature,
//     HMAC-SHA256 de `id.timestamp.corpo` assinado com o segredo.
// Aceitamos qualquer um dos dois. Mesmo assim o estado da assinatura não é lido do
// corpo: o webhook só diz QUAL assinatura mudou, e o servidor confere na API.
import { createHmac, createHash, timingSafeEqual } from "crypto";

/** Tolerância do `webhook-timestamp` (Standard Webhooks). */
const TOLERANCIA_S = 5 * 60;

const igual = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

/** Chaves candidatas: `whsec_<base64>` decodificado (padrão da spec) e o texto puro. */
function chavesDoSegredo(segredo: string): Buffer[] {
  const chaves = [Buffer.from(segredo, "utf8")];
  const b64 = segredo.startsWith("whsec_") ? segredo.slice(6) : segredo;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(b64) && b64.length % 4 === 0) chaves.push(Buffer.from(b64, "base64"));
  return chaves;
}

export function webhookAutentico(p: {
  url: string;
  headers: Headers;
  corpo: string;
  segredo: string | undefined;
  agora?: number;
}): boolean {
  const segredo = p.segredo?.trim();
  if (!segredo) return false; // fail-closed

  const naUrl = new URL(p.url).searchParams.get("webhookSecret");
  if (naUrl && igual(naUrl, segredo)) return true;

  const id = p.headers.get("webhook-id");
  const ts = p.headers.get("webhook-timestamp");
  const assinatura = p.headers.get("webhook-signature");
  if (!id || !ts || !assinatura || !/^\d+$/.test(ts)) return false;
  const agora = Math.floor((p.agora ?? Date.now()) / 1000);
  if (Math.abs(agora - Number(ts)) > TOLERANCIA_S) return false;

  const enviadas = assinatura
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  const conteudo = `${id}.${ts}.${p.corpo}`;
  return chavesDoSegredo(segredo).some((chave) => {
    const esperada = createHmac("sha256", chave).update(conteudo).digest("base64");
    return enviadas.some((e) => igual(e, esperada));
  });
}

export type StatusDaAssinatura = "sem_assinatura" | "pendente" | "ativa" | "pagamento_falhou" | "cancelada";

export interface EventoDeAssinatura {
  /** Id da entrega (`id` do corpo legado ou cabeçalho `webhook-id`): chave de idempotência. */
  entregaId: string | null;
  tipo: string;
  devMode: boolean;
  accountId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  checkoutId: string | null;
  metodo: string | null;
  valorCentavos: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Conta dona do checkout: `metadata.account_id`, senão o prefixo do `externalId` (`<conta>:<ts>`). */
function contaDoCheckout(checkout: Record<string, unknown> | null, pagamento: Record<string, unknown> | null) {
  const candidatos = [
    obj(checkout?.metadata)?.account_id,
    texto(checkout?.externalId)?.split(":")[0],
    texto(pagamento?.externalId)?.split(":")[0],
  ];
  for (const c of candidatos) if (typeof c === "string" && UUID.test(c)) return c;
  return null;
}

/** Lê o corpo (legado ou Standard Webhooks). null = não é um evento reconhecível. */
export function lerEvento(corpo: unknown, headers: Headers): EventoDeAssinatura | null {
  const b = obj(corpo);
  if (!b) return null;
  const tipo = texto(b.event) ?? texto(b.type);
  const data = obj(b.data);
  if (!tipo || !data) return null;
  const assinatura = obj(data.subscription);
  const checkout = obj(data.checkout);
  const pagamento = obj(data.payment);
  return {
    entregaId: texto(b.id) ?? headers.get("webhook-id"),
    tipo,
    devMode: b.devMode === true,
    accountId: contaDoCheckout(checkout, pagamento),
    subscriptionId: texto(assinatura?.id),
    customerId: texto(obj(data.customer)?.id),
    checkoutId: texto(checkout?.id),
    metodo: texto(assinatura?.method),
    valorCentavos: typeof assinatura?.amount === "number" ? assinatura.amount : null,
  };
}

/**
 * Estado da conta a partir do evento e do status conferido na API
 * (`PENDING` / `ACTIVE` / `CANCELLED`; null se a consulta falhou).
 */
export function novoStatus(tipo: string, statusNaApi: string | null): StatusDaAssinatura | null {
  if (statusNaApi === "CANCELLED" || tipo === "subscription.cancelled") return "cancelada";
  if (tipo === "subscription.payment_failed") return "pagamento_falhou";
  if (tipo === "subscription.completed" || tipo === "subscription.renewed" || tipo === "subscription.trial_started") {
    // sem a confirmação da API, confia no evento (a origem já foi autenticada)
    return statusNaApi === "PENDING" ? "pendente" : "ativa";
  }
  return null; // evento que não muda a assinatura
}
