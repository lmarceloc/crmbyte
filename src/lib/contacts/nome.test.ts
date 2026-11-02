import { describe, expect, it } from "vitest";
import { camposDeNome, juntarNome, partesDoNome, separarNome } from "./nome";

describe("separarNome", () => {
  it("primeira palavra é o nome, o resto é o sobrenome", () => {
    expect(separarNome("  Mariana   Souza Lima ")).toEqual({ nome: "Mariana", sobrenome: "Souza Lima" });
    expect(separarNome("Mariana")).toEqual({ nome: "Mariana", sobrenome: null });
    expect(separarNome(null)).toEqual({ nome: null, sobrenome: null });
    expect(separarNome("   ")).toEqual({ nome: null, sobrenome: null });
  });
});

describe("juntarNome", () => {
  it("junta e ignora o que está vazio", () => {
    expect(juntarNome(" Ana ", "Lima")).toBe("Ana Lima");
    expect(juntarNome("Ana", "")).toBe("Ana");
    expect(juntarNome(null, "Lima")).toBe("Lima");
    expect(juntarNome("", null)).toBeNull();
  });
});

describe("camposDeNome", () => {
  it("com sobrenome grava a separação e o nome completo", () => {
    expect(camposDeNome(" Maria Clara ", " Souza ")).toEqual({ name: "Maria Clara Souza", first_name: "Maria Clara", last_name: "Souza" });
  });
  it("sem sobrenome grava só o nome (a cadência divide)", () => {
    expect(camposDeNome("Maria Silva", "")).toEqual({ name: "Maria Silva", first_name: null, last_name: null });
    expect(camposDeNome("", "")).toEqual({ name: null, first_name: null, last_name: null });
  });
});

describe("partesDoNome", () => {
  it("a separação gravada vale, mesmo com nome composto", () => {
    expect(partesDoNome({ name: "Maria Clara Souza", first_name: "Maria Clara", last_name: "Souza" })).toEqual({
      nome: "Maria Clara",
      sobrenome: "Souza",
      completo: "Maria Clara Souza",
    });
  });
  it("sem separação, divide o nome", () => {
    expect(partesDoNome({ name: "Mariana Souza", first_name: null, last_name: null })).toEqual({
      nome: "Mariana",
      sobrenome: "Souza",
      completo: "Mariana Souza",
    });
  });
  it("sem nada, tudo null", () => {
    expect(partesDoNome(null)).toEqual({ nome: null, sobrenome: null, completo: null });
  });
});
