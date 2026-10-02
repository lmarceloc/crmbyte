import { describe, expect, it } from "vitest";
import { primeiroNome, renderizar, variaveisDesconhecidas } from "./renderizar";

describe("renderizar", () => {
  it("substitui variáveis conhecidas", () => {
    expect(renderizar("Oi {{primeiro_nome}}!", { primeiro_nome: "Ana" })).toBe("Oi Ana!");
  });
  it("deixa visível a variável sem dado ou desconhecida", () => {
    expect(renderizar("{{empresa}} {{xyz}}", { empresa: null })).toBe("{{empresa}} {{xyz}}");
  });
  it("lista variáveis desconhecidas", () => {
    expect(variaveisDesconhecidas("{{nome}} {{foo}} {{ bar }}")).toEqual(["foo", "bar"]);
  });
  it("primeiroNome", () => {
    expect(primeiroNome("  Mariana Souza ")).toBe("Mariana");
    expect(primeiroNome(null)).toBeNull();
  });
});
