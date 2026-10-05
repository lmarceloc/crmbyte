import { describe, expect, it } from "vitest";
import { linkedinSoDoNegocio, linksDaEmpresa, tituloSugerido } from "./dados-da-empresa";

describe("linksDaEmpresa", () => {
  it("normaliza site e LinkedIn da empresa", () => {
    expect(linksDaEmpresa({ website: "byte.com.br/", linkedin_url: "https://linkedin.com/company/byte" })).toEqual({
      site: "https://byte.com.br/",
      linkedin: "https://linkedin.com/company/byte",
    });
  });
  it("devolve null quando falta o dado, a empresa ou o link não é http(s)", () => {
    expect(linksDaEmpresa(null)).toEqual({ site: null, linkedin: null });
    expect(linksDaEmpresa({ website: "  ", linkedin_url: "javascript:alert(1)" })).toEqual({
      site: null,
      linkedin: null,
    });
  });
});

describe("linkedinSoDoNegocio", () => {
  const empresa = { linkedin_url: "https://linkedin.com/company/byte" };
  it("esconde o LinkedIn do negócio quando é o mesmo da empresa", () => {
    expect(linkedinSoDoNegocio("linkedin.com/company/byte", empresa)).toBeNull();
  });
  it("mostra o LinkedIn do negócio quando difere do da empresa ou a empresa não tem", () => {
    expect(linkedinSoDoNegocio("https://linkedin.com/in/fulano", empresa)).toBe("https://linkedin.com/in/fulano");
    expect(linkedinSoDoNegocio("https://linkedin.com/in/fulano", null)).toBe("https://linkedin.com/in/fulano");
  });
  it("devolve null sem LinkedIn no negócio", () => {
    expect(linkedinSoDoNegocio(null, empresa)).toBeNull();
    expect(linkedinSoDoNegocio("", empresa)).toBeNull();
  });
});

describe("tituloSugerido", () => {
  it("usa o nome da empresa quando o título está vazio", () => {
    expect(tituloSugerido("", "Byte")).toBe("Byte");
    expect(tituloSugerido("   ", "  Byte ")).toBe("Byte");
  });
  it("não sobrescreve o que já foi digitado", () => {
    expect(tituloSugerido("Proposta anual", "Byte")).toBe("Proposta anual");
  });
  it("devolve vazio sem empresa", () => {
    expect(tituloSugerido("", null)).toBe("");
  });
});
