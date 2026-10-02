import { describe, expect, it } from "vitest";
import { erroDoContatoNovo } from "./contato-obrigatorio";

describe("erroDoContatoNovo", () => {
  it("aceita nome e e-mail, sem telefone", () => {
    expect(erroDoContatoNovo({ nome: "Ana Lima", email: "ana@x.com.br" })).toBeNull();
  });

  it("exige o nome (espaços não contam)", () => {
    expect(erroDoContatoNovo({ nome: "", email: "ana@x.com.br" })).toBe("Informe o nome do contato.");
    expect(erroDoContatoNovo({ nome: "   ", email: "ana@x.com.br" })).toBe("Informe o nome do contato.");
    expect(erroDoContatoNovo({ email: "ana@x.com.br" })).toBe("Informe o nome do contato.");
  });

  it("exige o e-mail (espaços não contam)", () => {
    expect(erroDoContatoNovo({ nome: "Ana", email: "" })).toBe("Informe o e-mail do contato.");
    expect(erroDoContatoNovo({ nome: "Ana", email: "  " })).toBe("Informe o e-mail do contato.");
    expect(erroDoContatoNovo({ nome: "Ana", email: null })).toBe("Informe o e-mail do contato.");
  });

  it("recusa e-mail que não parece e-mail", () => {
    for (const ruim of ["sem-arroba", "a@b", "a @b.com", "@b.com"]) {
      expect(erroDoContatoNovo({ nome: "Ana", email: ruim })).toBe("E-mail inválido.");
    }
  });

  it("o nome vem antes do e-mail na mensagem", () => {
    expect(erroDoContatoNovo({ nome: "", email: "" })).toBe("Informe o nome do contato.");
  });
});
