import { describe, expect, it } from "vitest";
import { primeiroNome, renderizar, renderizarExemplo, sobrenome, variaveisDeNome, variaveisDesconhecidas } from "./renderizar";

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
  it("sobrenome é tudo depois do primeiro nome", () => {
    expect(sobrenome("Mariana Souza Lima")).toBe("Souza Lima");
    expect(sobrenome("Mariana")).toBeNull();
    expect(sobrenome(null)).toBeNull();
  });
  it("{{nome}} é só o primeiro nome e {{sobrenome}} o resto", () => {
    const dados = variaveisDeNome("Mariana Souza");
    expect(renderizar("Oi {{nome}} ({{sobrenome}}) — {{nome_completo}}", dados)).toBe("Oi Mariana (Souza) — Mariana Souza");
    expect(renderizar("Oi {{primeiro_nome}}", dados)).toBe("Oi Mariana");
  });
  it("lead sem sobrenome deixa {{sobrenome}} visível", () => {
    expect(renderizar("{{nome}} {{sobrenome}}", variaveisDeNome("Mariana"))).toBe("Mariana {{sobrenome}}");
  });
  it("prévia e validação aceitam as variáveis novas e a antiga", () => {
    expect(renderizarExemplo("{{nome}} {{sobrenome}} {{primeiro_nome}}")).toBe("Mariana Souza Mariana");
    expect(variaveisDesconhecidas("{{nome}} {{sobrenome}} {{nome_completo}} {{primeiro_nome}}")).toEqual([]);
  });
});
