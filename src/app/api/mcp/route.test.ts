import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminFalso } from "@/lib/mcp/admin-falso";

const autenticar = vi.fn();
let admin = adminFalso().admin;

vi.mock("@/lib/automations/admin-client", () => ({ supabaseAdmin: () => admin }));
vi.mock("@/lib/integracoes/api-keys", () => ({ autenticarChaveApi: (...a: unknown[]) => autenticar(...a) }));

import { DELETE, GET, POST } from "./route";

const CONTA = "11111111-1111-4111-8111-111111111111";
const chave = (acesso: string) => ({ keyId: "k", accountId: CONTA, accountName: "Agência Byte", userId: "u", acesso });
const post = (corpo: unknown, bruto = false) =>
  POST(new Request("http://x/api/mcp", { method: "POST", body: bruto ? (corpo as string) : JSON.stringify(corpo) }));
const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method, params });

beforeEach(() => {
  autenticar.mockReset();
  admin = adminFalso().admin;
});

describe("POST /api/mcp — autenticação", () => {
  it("sem chave válida: 401 com WWW-Authenticate", async () => {
    autenticar.mockResolvedValue(null);
    const r = await post(rpc("ping"));
    expect(r.status).toBe(401);
    expect(r.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("chave só de entrada (as antigas, do n8n) não entra no MCP: 403", async () => {
    autenticar.mockResolvedValue(chave("entrada"));
    const r = await post(rpc("tools/list"));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain("acesso de leitura ou escrita");
  });

  it("autentica antes de olhar o corpo: lixo sem chave dá 401, não 400", async () => {
    autenticar.mockResolvedValue(null);
    expect((await post("{não é json", true)).status).toBe(401);
  });
});

describe("POST /api/mcp — protocolo", () => {
  beforeEach(() => autenticar.mockResolvedValue(chave("leitura")));

  it("responde o pedido em JSON com o mesmo id", async () => {
    const r = await post(rpc("ping", undefined, 7));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("notificação: 202 sem corpo", async () => {
    const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(r.status).toBe(202);
    expect(await r.text()).toBe("");
  });

  it("JSON inválido: 400 com erro -32700", async () => {
    const r = await post("{quebrado", true);
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe(-32700);
  });

  it("corpo grande demais: 413", async () => {
    const r = await post(JSON.stringify({ ...rpc("ping"), lixo: "x".repeat(300 * 1024) }), true);
    expect(r.status).toBe(413);
  });

  it("lote: responde só as que têm id, na ordem", async () => {
    const r = await post([rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc("ping", undefined, 2)]);
    expect((await r.json()).map((x: { id: number }) => x.id)).toEqual([1, 2]);
  });

  it("lote vazio ou enorme é recusado", async () => {
    expect((await post([])).status).toBe(400);
    expect((await post(Array(21).fill(rpc("ping")))).status).toBe(400);
  });

  it("chave de leitura não vê nem chama ferramentas de escrita", async () => {
    const lista = await (await post(rpc("tools/list"))).json();
    expect(lista.result.tools.map((t: { name: string }) => t.name)).not.toContain("criar_negocio");
    const chamada = await (await post(rpc("tools/call", { name: "criar_negocio", arguments: {} }))).json();
    expect(chamada.result.isError).toBe(true);
    expect(chamada.result.content[0].text).toContain("somente leitura");
  });

  it("chave de escrita vê todas", async () => {
    autenticar.mockResolvedValue(chave("escrita"));
    const lista = await (await post(rpc("tools/list"))).json();
    expect(lista.result.tools.map((t: { name: string }) => t.name)).toContain("inscrever_em_cadencia");
  });
});

describe("GET/DELETE /api/mcp", () => {
  it("não há fluxo de eventos nem sessão: 405 com Allow: POST", () => {
    for (const handler of [GET, DELETE]) {
      const r = handler();
      expect(r.status).toBe(405);
      expect(r.headers.get("Allow")).toBe("POST");
    }
  });
});
