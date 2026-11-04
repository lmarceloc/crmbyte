// Servidor MCP mínimo (Model Context Protocol, transporte HTTP "streamable" sem estado):
// cada POST traz uma mensagem JSON-RPC e recebe a resposta em JSON. Só o que o CRM usa:
// initialize, ping e as ferramentas (tools/list, tools/call). Sem sessão, sem SSE e sem
// dependência nova, o que combina com o Worker da Cloudflare.
import { z } from "zod";
import { FERRAMENTAS } from "./ferramentas";
import { ErroDeFerramenta, type AcessoDaFerramenta, type ContextoMcp, type FerramentaMcp } from "./tipos";

/** Da mais nova para a mais antiga; o cliente que pedir uma delas recebe a mesma. */
export const VERSOES_SUPORTADAS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

const COD = { parse: -32700, pedidoInvalido: -32600, metodo: -32601, params: -32602, interno: -32603 } as const;

type Id = string | number | null;
export interface RespostaJsonRpc {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const erro = (id: Id, code: number, message: string): RespostaJsonRpc => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id: Id, result: unknown): RespostaJsonRpc => ({ jsonrpc: "2.0", id, result });

const pedidoSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

/** Chave de `leitura` só enxerga e chama ferramentas de leitura; `escrita` enxerga todas. */
export function ferramentasDoAcesso(acesso: AcessoDaFerramenta): FerramentaMcp[] {
  return FERRAMENTAS.filter((f) => acesso === "escrita" || f.acesso === "leitura");
}

const jsonSchemas = new Map<string, unknown>();
function schemaJson(f: FerramentaMcp): unknown {
  let s = jsonSchemas.get(f.nome);
  if (!s) {
    const { $schema, ...resto } = z.toJSONSchema(f.entrada, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    void $schema;
    s = resto;
    jsonSchemas.set(f.nome, s);
  }
  return s;
}

const resultadoDeFerramenta = (texto: string, isError = false) => ({
  content: [{ type: "text", text: texto }],
  ...(isError ? { isError: true } : {}),
});

async function chamarFerramenta(ctx: ContextoMcp, acesso: AcessoDaFerramenta, params: unknown) {
  const p = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).safeParse(params);
  if (!p.success) return { codigo: COD.params, mensagem: "Parâmetros inválidos: informe `name` e `arguments`." };
  const ferramenta = FERRAMENTAS.find((f) => f.nome === p.data.name);
  if (!ferramenta) return { codigo: COD.params, mensagem: `Ferramenta desconhecida: ${p.data.name}.` };
  if (ferramenta.acesso === "escrita" && acesso !== "escrita") {
    return resultadoDeFerramenta("Esta chave é somente leitura. Gere uma chave com acesso de escrita para usar esta ferramenta.", true);
  }
  const args = ferramenta.entrada.safeParse(p.data.arguments ?? {});
  if (!args.success) {
    const msg = args.error.issues.map((i) => `${i.path.join(".") || "argumentos"}: ${i.message}`).join("; ");
    return resultadoDeFerramenta(`Argumentos inválidos — ${msg}`, true);
  }
  try {
    const resultado = await ferramenta.executar(ctx, args.data);
    return resultadoDeFerramenta(JSON.stringify(resultado, null, 2));
  } catch (e) {
    if (e instanceof ErroDeFerramenta) return resultadoDeFerramenta(e.message, true);
    console.error("[mcp] falha na ferramenta", ferramenta.nome, e);
    return resultadoDeFerramenta("Erro interno ao executar a ferramenta. Tente de novo.", true);
  }
}

/**
 * Trata uma mensagem JSON-RPC. Devolve `null` quando não há o que responder
 * (notificações, como `notifications/initialized`).
 */
export async function tratarMensagem(
  mensagem: unknown,
  ctx: ContextoMcp,
  acesso: AcessoDaFerramenta,
  nomeDaConta: string,
): Promise<RespostaJsonRpc | null> {
  const m = pedidoSchema.safeParse(mensagem);
  if (!m.success) {
    // resposta de um cliente a um pedido nosso (nunca fazemos): ignora
    if (mensagem && typeof mensagem === "object" && ("result" in mensagem || "error" in mensagem)) return null;
    return erro(null, COD.pedidoInvalido, "Mensagem JSON-RPC inválida.");
  }
  const { id, method, params } = m.data;
  if (id === undefined) return null; // notificação

  try {
    switch (method) {
      case "initialize": {
        const pedida = (params as { protocolVersion?: unknown } | null | undefined)?.protocolVersion;
        const versao = (VERSOES_SUPORTADAS as readonly unknown[]).includes(pedida) ? pedida : VERSOES_SUPORTADAS[0];
        return ok(id, {
          protocolVersion: versao,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "crmbyte", title: "CRM", version: "1.0.0" },
          instructions:
            `Você está conectado ao CRM da conta "${nomeDaConta}". ` +
            "Procure o contato (buscar_contatos) antes de criar negócios, tarefas ou notas, e use listar_pipelines " +
            "para descobrir os ids de funil e etapa. Nunca invente ids.",
        });
      }
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, {
          tools: ferramentasDoAcesso(acesso).map((f) => ({
            name: f.nome,
            description: f.descricao,
            inputSchema: schemaJson(f),
            annotations: f.acesso === "leitura" ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false },
          })),
        });
      case "tools/call": {
        const r = await chamarFerramenta(ctx, acesso, params);
        return "codigo" in r ? erro(id, r.codigo, r.mensagem) : ok(id, r);
      }
      default:
        return erro(id, COD.metodo, `Método não suportado: ${method}.`);
    }
  } catch (e) {
    console.error("[mcp] erro interno", method, e);
    return erro(id, COD.interno, "Erro interno.");
  }
}

export { COD as CODIGOS_JSON_RPC };
