import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { lerEvento, novoStatus, webhookAutentico } from "./webhook";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
const URL_BASE = "https://crm.agenciabyte.com/api/abacatepay/webhook";
const CONTA = "11111111-1111-1111-1111-111111111111";

function assinar(id: string, ts: number, corpo: string, chave: Buffer | string) {
  return "v1," + createHmac("sha256", chave).update(`${id}.${ts}.${corpo}`).digest("base64");
}

describe("webhookAutentico", () => {
  it("aceita o segredo na URL (formato legado) e recusa o errado", () => {
    const h = new Headers();
    expect(webhookAutentico({ url: `${URL_BASE}?webhookSecret=${SEGREDO}`, headers: h, corpo: "{}", segredo: SEGREDO })).toBe(true);
    expect(webhookAutentico({ url: `${URL_BASE}?webhookSecret=outro`, headers: h, corpo: "{}", segredo: SEGREDO })).toBe(false);
    expect(webhookAutentico({ url: URL_BASE, headers: h, corpo: "{}", segredo: SEGREDO })).toBe(false);
  });

  it("sem segredo configurado, recusa tudo", () => {
    expect(webhookAutentico({ url: `${URL_BASE}?webhookSecret=`, headers: new Headers(), corpo: "{}", segredo: "" })).toBe(false);
    expect(webhookAutentico({ url: `${URL_BASE}?webhookSecret=x`, headers: new Headers(), corpo: "{}", segredo: undefined })).toBe(false);
  });

  it("aceita Standard Webhooks assinado com o segredo e recusa corpo alterado ou antigo", () => {
    const agora = 1_800_000_000_000;
    const ts = agora / 1000;
    const corpo = '{"type":"subscription.completed"}';
    const headers = new Headers({
      "webhook-id": "msg_1",
      "webhook-timestamp": String(ts),
      "webhook-signature": assinar("msg_1", ts, corpo, SEGREDO),
    });
    expect(webhookAutentico({ url: URL_BASE, headers, corpo, segredo: SEGREDO, agora })).toBe(true);
    expect(webhookAutentico({ url: URL_BASE, headers, corpo: corpo + " ", segredo: SEGREDO, agora })).toBe(false);
    expect(webhookAutentico({ url: URL_BASE, headers, corpo, segredo: SEGREDO, agora: agora + 10 * 60_000 })).toBe(false);
  });

  it("aceita segredo whsec_ (chave em base64, como na especificação)", () => {
    const chave = Buffer.from("chave-binaria-de-teste");
    const segredo = "whsec_" + chave.toString("base64");
    const agora = 1_800_000_000_000;
    const ts = agora / 1000;
    const headers = new Headers({
      "webhook-id": "msg_2",
      "webhook-timestamp": String(ts),
      "webhook-signature": "v1,lixo " + assinar("msg_2", ts, "{}", chave),
    });
    expect(webhookAutentico({ url: URL_BASE, headers, corpo: "{}", segredo, agora })).toBe(true);
  });
});

describe("lerEvento", () => {
  const data = {
    subscription: { id: "subs_1", amount: 2900, method: "CARD", status: "ACTIVE" },
    customer: { id: "cust_1" },
    checkout: { id: "bill_1", externalId: `${CONTA}:1700000000000`, metadata: { account_id: CONTA } },
  };

  it("lê o formato legado (event + id)", () => {
    const e = lerEvento({ id: "log_1", event: "subscription.completed", devMode: true, data }, new Headers());
    expect(e).toMatchObject({
      entregaId: "log_1",
      tipo: "subscription.completed",
      devMode: true,
      accountId: CONTA,
      subscriptionId: "subs_1",
      customerId: "cust_1",
      checkoutId: "bill_1",
      metodo: "CARD",
      valorCentavos: 2900,
    });
  });

  it("lê o Standard Webhooks (type + cabeçalho webhook-id) e acha a conta pelo externalId", () => {
    const semMetadata = { ...data, checkout: { id: "bill_1", externalId: `${CONTA}:1`, metadata: null } };
    const e = lerEvento({ type: "subscription.renewed", data: semMetadata }, new Headers({ "webhook-id": "msg_9" }));
    expect(e?.entregaId).toBe("msg_9");
    expect(e?.tipo).toBe("subscription.renewed");
    expect(e?.accountId).toBe(CONTA);
  });

  it("ignora conta que não é UUID e corpo sem evento", () => {
    const e = lerEvento({ event: "subscription.completed", data: { checkout: { externalId: "lixo:1", metadata: { account_id: "x" } } } }, new Headers());
    expect(e?.accountId).toBeNull();
    expect(lerEvento({ data: {} }, new Headers())).toBeNull();
    expect(lerEvento("texto", new Headers())).toBeNull();
  });
});

describe("novoStatus", () => {
  it("pagamento confirmado ativa; cancelamento e recusa aparecem", () => {
    expect(novoStatus("subscription.completed", "ACTIVE")).toBe("ativa");
    expect(novoStatus("subscription.renewed", null)).toBe("ativa");
    expect(novoStatus("subscription.completed", "PENDING")).toBe("pendente");
    expect(novoStatus("subscription.payment_failed", "ACTIVE")).toBe("pagamento_falhou");
    expect(novoStatus("subscription.cancelled", "ACTIVE")).toBe("cancelada");
  });

  it("a API dizendo CANCELLED vence o evento; evento sem efeito não muda nada", () => {
    expect(novoStatus("subscription.renewed", "CANCELLED")).toBe("cancelada");
    expect(novoStatus("subscription.plan_changed", "ACTIVE")).toBeNull();
  });
});
