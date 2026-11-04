import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json } from "@/lib/api-utils";
import { autenticarChaveApi } from "@/lib/integracoes/api-keys";
import { CODIGOS_JSON_RPC, tratarMensagem, type RespostaJsonRpc } from "@/lib/mcp/protocolo";

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024;
const MAX_LOTE = 20;

// Servidor MCP do CRM, para a IA do cliente consultar e criar coisas na conta dele.
// Autentica pela mesma chave `wacrm_…` da API (Authorization: Bearer ou X-Api-Key); a chave
// define a conta e o que pode: `leitura` consulta, `escrita` também grava. Chaves de `entrada`
// (as antigas, só para mandar contatos) não entram aqui.
export async function POST(request: Request) {
  const admin = supabaseAdmin();
  const conta = await autenticarChaveApi(admin, request.headers);
  if (!conta) {
    const r = fail("unauthorized", "Chave de API ausente, inválida ou revogada.", 401);
    r.headers.set("WWW-Authenticate", 'Bearer realm="crm"');
    return r;
  }
  if (conta.acesso === "entrada") {
    return fail("forbidden", "Esta chave não tem acesso ao MCP. Gere uma chave com acesso de leitura ou escrita.", 403);
  }

  const texto = await request.text();
  if (texto.length > MAX_BYTES) return fail("payload_too_large", "Mensagem grande demais.", 413);
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: CODIGOS_JSON_RPC.parse, message: "JSON inválido." } }, 400);
  }

  const ctx = { admin, accountId: conta.accountId, userId: conta.userId };
  const tratar = (m: unknown) => tratarMensagem(m, ctx, conta.acesso as "leitura" | "escrita", conta.accountName);

  if (Array.isArray(corpo)) {
    if (corpo.length === 0 || corpo.length > MAX_LOTE) {
      return json({ jsonrpc: "2.0", id: null, error: { code: CODIGOS_JSON_RPC.pedidoInvalido, message: "Lote inválido." } }, 400);
    }
    const respostas: RespostaJsonRpc[] = [];
    for (const m of corpo) {
      const r = await tratar(m);
      if (r) respostas.push(r);
    }
    return respostas.length ? json(respostas) : new Response(null, { status: 202 });
  }

  const resposta = await tratar(corpo);
  return resposta ? json(resposta) : new Response(null, { status: 202 });
}

// Sem sessão nem fluxo de eventos do servidor: o cliente só usa POST.
const naoPermitido = () =>
  new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
export const GET = naoPermitido;
export const DELETE = naoPermitido;
