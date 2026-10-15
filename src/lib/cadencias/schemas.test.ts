import { describe, expect, it } from "vitest";
import { editarCadenciaSchema, passosSchema } from "./schemas";

describe("schemas da cadência", () => {
  it("aceita ramo recursivo", () => {
    const r = passosSchema.safeParse([
      {
        id: "r",
        tipo: "ramo",
        condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
        sim: [{ id: "e", tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false }],
        nao: [],
      },
    ]);
    expect(r.success).toBe(true);
  });
  it("recusa espera fora do limite e edição vazia", () => {
    expect(passosSchema.safeParse([{ id: "x", tipo: "espera", diasUteis: 0 }]).success).toBe(false);
    expect(editarCadenciaSchema.safeParse({}).success).toBe(false);
  });
});

describe("limite de lead quente", () => {
  it("configuração antiga (sem o campo) ganha o padrão de 2 aberturas", async () => {
    const { configuracaoSchema } = await import("./schemas");
    const { configuracaoPadrao } = await import("./tipos");
    const antiga: Record<string, unknown> = { ...configuracaoPadrao() };
    delete antiga.limiarLeadQuente;
    expect(configuracaoSchema.parse(antiga).limiarLeadQuente).toBe(2);
    expect(configuracaoPadrao().limiarLeadQuente).toBe(2);
  });

  it("aceita de 1 a 10, inteiro", async () => {
    const { configuracaoSchema, mudarLimiarSchema } = await import("./schemas");
    const { configuracaoPadrao } = await import("./tipos");
    expect(configuracaoSchema.parse({ ...configuracaoPadrao(), limiarLeadQuente: 5 }).limiarLeadQuente).toBe(5);
    for (const ruim of [0, 11, 2.5]) {
      expect(configuracaoSchema.safeParse({ ...configuracaoPadrao(), limiarLeadQuente: ruim }).success).toBe(false);
      expect(mudarLimiarSchema.safeParse({ limiarLeadQuente: ruim }).success).toBe(false);
    }
    expect(mudarLimiarSchema.parse({ limiarLeadQuente: 1 })).toEqual({ limiarLeadQuente: 1 });
    // só o limite: qualquer outra chave é recusada
    expect(mudarLimiarSchema.safeParse({ limiarLeadQuente: 2, passos: [] }).success).toBe(false);
  });
});

describe("inscrição por contato e negócio da inscrição", () => {
  it("aceita negócio OU lista de contatos, não os dois", async () => {
    const { inscreverNegocioSchema } = await import("./schemas");
    const u = "00000000-0000-4000-8000-000000000001";
    expect(inscreverNegocioSchema.safeParse({ deal_id: u }).success).toBe(true);
    expect(inscreverNegocioSchema.safeParse({ contact_ids: [u] }).success).toBe(true);
    expect(inscreverNegocioSchema.safeParse({ contact_ids: [] }).success).toBe(false);
    expect(inscreverNegocioSchema.safeParse({ deal_id: u, contact_ids: [u] }).success).toBe(false);
  });

  it("configuração antiga sem `negocio` ganha o padrão", async () => {
    const { configuracaoSchema } = await import("./schemas");
    const { configuracaoPadrao } = await import("./tipos");
    const { negocio: _, ...antiga } = configuracaoPadrao();
    expect(configuracaoSchema.parse(antiga).negocio).toEqual({ pipelineId: null, stageId: null });
  });
});
