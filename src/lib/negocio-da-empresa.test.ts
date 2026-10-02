import { describe, expect, it } from "vitest";
import { etapaInicial, funilInicial, montarNegocioDaEmpresa } from "./negocio-da-empresa";

describe("funilInicial", () => {
  const funis = [{ id: "a" }, { id: "b" }];
  it("usa o escolhido quando ele existe, senão o primeiro", () => {
    expect(funilInicial(funis, "b")).toBe("b");
    expect(funilInicial(funis, "apagado")).toBe("a");
    expect(funilInicial(funis)).toBe("a");
  });
  it("devolve vazio quando não há funil nenhum", () => {
    expect(funilInicial([])).toBe("");
  });
});

describe("etapaInicial", () => {
  it("escolhe a de menor posição, não a primeira da lista", () => {
    expect(
      etapaInicial([
        { id: "meio", position: 2 },
        { id: "inicio", position: 0 },
        { id: "fim", position: 5 },
      ]),
    ).toBe("inicio");
  });
  it("devolve vazio quando o funil não tem etapa", () => {
    expect(etapaInicial([])).toBe("");
  });
});

describe("montarNegocioDaEmpresa", () => {
  const base = {
    titulo: "  Plano anual  ",
    empresaId: "emp-1",
    funilId: "fun-1",
    etapaId: "eta-1",
    accountId: "acc-1",
    userId: "usr-1",
    moeda: "BRL",
  };

  it("amarra o negócio à empresa, aberto e sem contato", () => {
    const r = montarNegocioDaEmpresa(base);
    expect(r).toEqual({
      ok: true,
      negocio: {
        account_id: "acc-1",
        user_id: "usr-1",
        company_id: "emp-1",
        pipeline_id: "fun-1",
        stage_id: "eta-1",
        title: "Plano anual",
        value: 0,
        currency: "BRL",
        status: "open",
      },
    });
    // O contato entra depois, em deal_contacts: a linha do negócio não o carrega.
    expect(r.ok && "contact_id" in r.negocio).toBe(false);
  });

  it("recusa nome vazio ou só espaços", () => {
    expect(montarNegocioDaEmpresa({ ...base, titulo: "   " })).toEqual({ ok: false, erro: "Dê um nome ao negócio." });
    expect(montarNegocioDaEmpresa({ ...base, titulo: "" }).ok).toBe(false);
  });

  it("recusa quando não há funil ou etapa para o negócio nascer", () => {
    expect(montarNegocioDaEmpresa({ ...base, funilId: "" })).toEqual({
      ok: false,
      erro: "Escolha o funil e a etapa do negócio.",
    });
    expect(montarNegocioDaEmpresa({ ...base, etapaId: "" }).ok).toBe(false);
  });

  it("sem moeda informada deixa o default do banco valer", () => {
    const r = montarNegocioDaEmpresa({ ...base, moeda: null });
    expect(r.ok && "currency" in r.negocio).toBe(false);
  });
});
