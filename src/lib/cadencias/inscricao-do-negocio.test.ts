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

describe("ocupacaoEmOutraCadencia — um lead numa cadência por vez", () => {
  const ativas = [
    { deal_id: "d-topflex", contact_id: "c-marlon", company_id: "emp-topflex", cadencia: "Indústria" },
    { deal_id: "d-outro", contact_id: "c-ana", company_id: "emp-latec", cadencia: "Química" },
  ];

  it("o próprio negócio já em outra cadência", async () => {
    const { ocupacaoEmOutraCadencia, textoDaOcupacao } = await import("./inscricao-do-negocio");
    const o = ocupacaoEmOutraCadencia({ id: "d-topflex", company_id: "emp-topflex", contatos: ["c-marlon"] }, ativas);
    expect(o).toEqual({ cadencia: "Indústria", motivo: "negocio" });
    expect(textoDaOcupacao(o!)).toBe("Já está na cadência “Indústria”.");
  });

  it("outro negócio da mesma empresa já em cadência também bloqueia", async () => {
    const { ocupacaoEmOutraCadencia, textoDaOcupacao } = await import("./inscricao-do-negocio");
    const o = ocupacaoEmOutraCadencia({ id: "d-latec-2", company_id: "emp-latec", contatos: ["c-novo"] }, ativas);
    expect(o).toEqual({ cadencia: "Química", motivo: "empresa" });
    expect(textoDaOcupacao(o!)).toMatch(/A empresa já está/);
  });

  it("contato já em cadência por outro negócio bloqueia (não recebe duas sequências)", async () => {
    const { ocupacaoEmOutraCadencia } = await import("./inscricao-do-negocio");
    expect(ocupacaoEmOutraCadencia({ id: "d-x", company_id: null, contatos: ["c-ana"] }, ativas)).toEqual({
      cadencia: "Química",
      motivo: "contato",
    });
  });

  it("sem nada ativo em outra cadência: livre; empresa nula não casa com empresa nula", async () => {
    const { ocupacaoEmOutraCadencia } = await import("./inscricao-do-negocio");
    expect(ocupacaoEmOutraCadencia({ id: "d-x", company_id: "emp-y", contatos: ["c-z"] }, ativas)).toBeNull();
    expect(
      ocupacaoEmOutraCadencia({ id: "d-x", company_id: null, contatos: [] }, [
        { deal_id: "d-1", contact_id: "c-1", company_id: null, cadencia: "A" },
      ]),
    ).toBeNull();
  });
});
