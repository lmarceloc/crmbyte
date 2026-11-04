import { describe, expect, it } from "vitest";
import { adminFalso } from "./admin-falso";
import { ferramentasDoAcesso, tratarMensagem, VERSOES_SUPORTADAS } from "./protocolo";
import { FERRAMENTAS } from "./ferramentas";

const CONTA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";

function chamar(msg: unknown, acesso: "leitura" | "escrita" = "escrita", roteiro = {}) {
  const { admin, chamadas } = adminFalso(roteiro);
  const p = tratarMensagem(msg, { admin, accountId: CONTA, userId: USUARIO }, acesso, "Agência Byte");
  return p.then((r) => ({ r, chamadas }));
}
const req = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, params });

describe("initialize", () => {
  it("devolve a versão pedida quando é suportada e a mais nova quando não", async () => {
    const a = await chamar(req("initialize", { protocolVersion: "2025-03-26" }));
    expect((a.r?.result as { protocolVersion: string }).protocolVersion).toBe("2025-03-26");
    const b = await chamar(req("initialize", { protocolVersion: "1999-01-01" }));
    expect((b.r?.result as { protocolVersion: string }).protocolVersion).toBe(VERSOES_SUPORTADAS[0]);
  });

  it("anuncia só ferramentas e cita a conta nas instruções", async () => {
    const { r } = await chamar(req("initialize", { protocolVersion: "2025-06-18" }));
    const res = r?.result as { capabilities: Record<string, unknown>; instructions: string };
    expect(Object.keys(res.capabilities)).toEqual(["tools"]);
    expect(res.instructions).toContain("Agência Byte");
  });
});

describe("mensagens", () => {
  it("notificação não tem resposta", async () => {
    expect((await chamar({ jsonrpc: "2.0", method: "notifications/initialized" })).r).toBeNull();
  });

  it("ping responde vazio; método desconhecido dá -32601; lixo dá -32600", async () => {
    expect((await chamar(req("ping"))).r?.result).toEqual({});
    expect((await chamar(req("resources/list"))).r?.error?.code).toBe(-32601);
    expect((await chamar({ foo: 1 })).r?.error?.code).toBe(-32600);
  });

  it("mantém o id do pedido na resposta", async () => {
    expect((await chamar(req("ping", undefined, "abc"))).r?.id).toBe("abc");
  });
});

describe("tools/list", () => {
  const nomes = async (acesso: "leitura" | "escrita") => {
    const { r } = await chamar(req("tools/list"), acesso);
    return (r?.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  };

  it("chave de leitura só enxerga as ferramentas de leitura", async () => {
    expect((await nomes("leitura")).sort()).toEqual(["buscar_contatos", "listar_cadencias", "listar_pipelines"]);
  });

  it("chave de escrita enxerga todas, com as oito da lista combinada", async () => {
    const todas = await nomes("escrita");
    expect(todas).toHaveLength(FERRAMENTAS.length);
    for (const n of [
      "buscar_contatos",
      "criar_contato",
      "listar_pipelines",
      "criar_negocio",
      "mover_negocio",
      "criar_tarefa",
      "adicionar_nota",
      "inscrever_em_cadencia",
    ]) {
      expect(todas).toContain(n);
    }
  });

  it("cada ferramenta tem inputSchema de objeto, sem $schema, e marca leitura/escrita", async () => {
    const { r } = await chamar(req("tools/list"));
    const tools = (r?.result as { tools: { name: string; inputSchema: Record<string, unknown>; annotations: { readOnlyHint: boolean } }[] }).tools;
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema).not.toHaveProperty("$schema");
      const def = FERRAMENTAS.find((f) => f.nome === t.name);
      expect(t.annotations.readOnlyHint).toBe(def?.acesso === "leitura");
    }
    // campos com default não são obrigatórios na entrada
    const busca = tools.find((t) => t.name === "buscar_contatos");
    expect(busca?.inputSchema.required ?? []).not.toContain("limite");
  });

  it("ferramentasDoAcesso nunca mistura escrita em chave de leitura", () => {
    expect(ferramentasDoAcesso("leitura").every((f) => f.acesso === "leitura")).toBe(true);
  });
});

describe("tools/call", () => {
  const chamarFerramenta = (name: string, args: unknown, acesso: "leitura" | "escrita" = "escrita", roteiro = {}) =>
    chamar(req("tools/call", { name, arguments: args }), acesso, roteiro);

  it("chave de leitura é recusada nas de escrita, sem tocar no banco", async () => {
    const { r, chamadas } = await chamarFerramenta(
      "criar_tarefa",
      { titulo: "Ligar" },
      "leitura",
    );
    const res = r?.result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("somente leitura");
    expect(chamadas).toHaveLength(0);
  });

  it("ferramenta que não existe é erro de protocolo", async () => {
    expect((await chamarFerramenta("apagar_tudo", {})).r?.error?.code).toBe(-32602);
  });

  it("argumentos inválidos voltam como erro da ferramenta, sem tocar no banco", async () => {
    const { r, chamadas } = await chamarFerramenta("criar_negocio", { titulo: "", contact_id: "nao-e-uuid" });
    const res = r?.result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Argumentos inválidos");
    expect(chamadas).toHaveLength(0);
  });

  it("falha inesperada não vaza o detalhe do banco", async () => {
    const { r } = await chamarFerramenta("listar_pipelines", {}, "leitura", {
      pipelines: { data: null, error: { message: 'relation "segredo" does not exist' } },
    });
    const res = r?.result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain("segredo");
  });
});
