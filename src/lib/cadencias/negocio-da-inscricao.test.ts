import { describe, expect, it } from "vitest";
import { escolherFunilEEtapa, tituloDoNegocio } from "./negocio-da-inscricao";

const funis = [
  { id: "f1", etapas: [{ id: "f1b", position: 2 }, { id: "f1a", position: 1 }] },
  { id: "f2", etapas: [{ id: "f2a", position: 0 }, { id: "f2b", position: 1 }] },
  { id: "vazio", etapas: [] },
];
const semCadencia = { pipelineId: null, stageId: null };

describe("escolherFunilEEtapa", () => {
  it("sem nada configurado: primeiro funil, menor posição", () => {
    expect(escolherFunilEEtapa({}, semCadencia, funis)).toEqual({ pipelineId: "f1", stageId: "f1a" });
  });
  it("usa o funil/etapa da cadência", () => {
    expect(escolherFunilEEtapa({}, { pipelineId: "f2", stageId: "f2b" }, funis)).toEqual({ pipelineId: "f2", stageId: "f2b" });
  });
  it("o pedido vence a cadência", () => {
    expect(escolherFunilEEtapa({ pipelineId: "f1", stageId: "f1b" }, { pipelineId: "f2", stageId: "f2b" }, funis)).toEqual({
      pipelineId: "f1",
      stageId: "f1b",
    });
  });
  it("etapa de outro funil cai na primeira etapa do funil", () => {
    expect(escolherFunilEEtapa({ pipelineId: "f2", stageId: "f1b" }, semCadencia, funis)).toEqual({ pipelineId: "f2", stageId: "f2a" });
  });
  it("funil apagado ou sem etapas é ignorado", () => {
    expect(escolherFunilEEtapa({ pipelineId: "sumiu" }, { pipelineId: "vazio", stageId: null }, funis)).toEqual({
      pipelineId: "f1",
      stageId: "f1a",
    });
  });
  it("conta sem funil com etapa: null", () => {
    expect(escolherFunilEEtapa({}, semCadencia, [{ id: "vazio", etapas: [] }])).toBeNull();
  });
});

describe("tituloDoNegocio", () => {
  it("junta contato e empresa", () => expect(tituloDoNegocio("Ana", "ACME")).toBe("Ana — ACME"));
  it("sem empresa", () => expect(tituloDoNegocio("Ana", null)).toBe("Ana"));
  it("sem nada", () => expect(tituloDoNegocio(" ", undefined)).toBe("Negócio da cadência"));
});
