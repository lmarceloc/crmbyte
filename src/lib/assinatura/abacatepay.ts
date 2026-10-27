// Cliente da AbacatePay (API v2) para a assinatura do CRM. Server-only: a chave
// (ABACATEPAY_API_KEY) nunca sai daqui. Valores sempre em centavos.
//
// Fluxo: o admin clica em "Assinar" → garantimos o produto mensal → criamos o
// checkout de assinatura com o id da conta em `metadata` → o cliente paga na página
// da AbacatePay → os webhooks (src/lib/assinatura/webhook.ts) atualizam a conta.

const BASE = "https://api.abacatepay.com/v2";

/** Preço do plano, em centavos (R$ 29,00). */
export const PRECO_CENTAVOS = 2900;
/** Identificador do produto no catálogo da AbacatePay (`externalId`). */
export const PRODUTO_EXTERNAL_ID = "crm-byte-mensal";

export class AbacatePayError extends Error {
  constructor(
    message: string,
    /** Status HTTP da AbacatePay (0 = sem resposta). */
    readonly status: number = 0,
    /** Chave ausente, inválida ou sem permissão: tentar outro caminho não adianta. */
    readonly deConfiguracao = false,
  ) {
    super(message);
  }
}

export function chaveConfigurada(): string | null {
  return process.env.ABACATEPAY_API_KEY?.trim() || null;
}

type Envelope<T> = { data: T; success: true; error: null } | { data: null; success: false; error: string };

async function chamar<T>(caminho: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const chave = chaveConfigurada();
  if (!chave) throw new AbacatePayError("Pagamento não configurado (ABACATEPAY_API_KEY).", 0, true);
  let res: Response;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new AbacatePayError(`Sem resposta da AbacatePay: ${e instanceof Error ? e.message : String(e)}`);
  }
  const corpo = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !corpo?.success) {
    const motivo = corpo && !corpo.success ? corpo.error : `HTTP ${res.status}`;
    if (res.status === 401) throw new AbacatePayError("Chave da AbacatePay inválida ou revogada.", 401, true);
    if (res.status === 403) throw new AbacatePayError(`A chave da AbacatePay não tem permissão: ${motivo}`, 403, true);
    throw new AbacatePayError(`AbacatePay recusou: ${motivo}`, res.status);
  }
  return corpo.data;
}

export interface ProdutoAbacate {
  id: string;
  externalId: string;
  price: number;
  cycle: string | null;
}

export interface CheckoutAbacate {
  id: string;
  url: string;
  status: string;
  devMode: boolean;
}

export interface AssinaturaAbacate {
  id: string;
  checkoutId: string | null;
  customerId: string;
  amount: number;
  status: "PENDING" | "ACTIVE" | "CANCELLED";
  method: "CARD" | "PIX";
  devMode: boolean;
}

let produtoEmCache: ProdutoAbacate | null = null;

/** Produto mensal do CRM: busca pelo `externalId`; se não existir, cria. */
export async function garantirProduto(): Promise<ProdutoAbacate> {
  if (produtoEmCache) return produtoEmCache;
  try {
    produtoEmCache = await chamar<ProdutoAbacate>(`/products/get?externalId=${encodeURIComponent(PRODUTO_EXTERNAL_ID)}`);
  } catch (e) {
    // não achou (a API pode responder 404 ou 400): cria. Chave errada ou rede fora: desiste.
    if (!(e instanceof AbacatePayError) || e.deConfiguracao || e.status === 0) throw e;
    produtoEmCache = await chamar<ProdutoAbacate>("/products/create", {
      method: "POST",
      body: {
        externalId: PRODUTO_EXTERNAL_ID,
        name: "CRM Byte — plano mensal",
        description: "CRM Byte para o time inteiro, sem cobrança por usuário.",
        price: PRECO_CENTAVOS,
        currency: "BRL",
        cycle: "MONTHLY",
      },
    });
  }
  return produtoEmCache;
}

/** Checkout de assinatura da conta. Devolve a URL para onde o cliente vai pagar. */
export async function criarCheckoutDeAssinatura(p: {
  accountId: string;
  userId: string;
  origem: string;
}): Promise<CheckoutAbacate> {
  const produto = await garantirProduto();
  const base = p.origem.replace(/\/+$/, "");
  return chamar<CheckoutAbacate>("/subscriptions/create", {
    method: "POST",
    body: {
      items: [{ id: produto.id, quantity: 1 }],
      // um checkout novo a cada clique (um externalId repetido devolveria o antigo)
      externalId: `${p.accountId}:${Date.now()}`,
      // /assinatura devolve a conta liberada para Configurações → Plano
      returnUrl: `${base}/assinatura`,
      completionUrl: `${base}/assinatura?assinatura=ok`,
      metadata: { account_id: p.accountId, user_id: p.userId },
    },
  });
}

export function buscarAssinatura(id: string): Promise<AssinaturaAbacate> {
  return chamar<AssinaturaAbacate>(`/subscriptions/get?id=${encodeURIComponent(id)}`);
}

/** Link do portal do cliente: trocar cartão, ver pagamentos e cancelar no fim do ciclo. */
export async function criarLinkDoPortal(customerId: string, checkoutId: string): Promise<string> {
  const r = await chamar<{ url: string }>("/customer-portal/create", {
    method: "POST",
    body: { customerId, checkoutId },
  });
  return r.url;
}
