import { describe, expect, it } from "vitest";
import { resumoDeInscricao, rotuloDoInscrito } from "./inscricao-do-negocio";

const statusDe = (m: Record<string, string>) => (id: string) => m[id];

describe("resumoDeInscricao", () => {
  it("deixa inscrever quando ninguém do negócio está na cadência", () => {
    expect(resumoDeInscricao(["a", "b"], statusDe({}))).toEqual({ pendentes: 2, rotuloQuandoInscrito: null });
  });

  it("conta só os que faltam quando parte do negócio já está inscrita", () => {
    expect(resumoDeInscricao(["a", "b"], statusDe({ a: "ativa" }))).toEqual({
      pendentes: 1,
      rotuloQuandoInscrito: null,
    });
  });

  it("mostra 'Em cadência' quando todos os elegíveis já estão inscritos e algum segue ativo", () => {
    expect(resumoDeInscricao(["a", "b"], statusDe({ a: "ativa", b: "concluida" }))).toEqual({
      pendentes: 0,
      rotuloQuandoInscrito: "Em cadência",
    });
  });

  it("mostra 'Já inscrito' quando todos já passaram pela cadência (concluída ou parada)", () => {
    expect(resumoDeInscricao(["a", "b"], statusDe({ a: "concluida", b: "parada" }))).toEqual({
      pendentes: 0,
      rotuloQuandoInscrito: "Já inscrito",
    });
  });

  it("sem contato elegível não há rótulo de inscrito (o botão segue desabilitado por outro motivo)", () => {
    expect(resumoDeInscricao([], statusDe({}))).toEqual({ pendentes: 0, rotuloQuandoInscrito: null });
  });
});

describe("rotuloDoInscrito", () => {
  it("distingue a sequência em andamento das encerradas", () => {
    expect(rotuloDoInscrito("ativa")).toBe("em cadência");
    expect(rotuloDoInscrito("concluida")).toBe("já inscrito");
    expect(rotuloDoInscrito("parada")).toBe("já inscrito");
  });
});
