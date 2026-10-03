import { describe, expect, it } from "vitest";
import { comHandles, consultaDeMencao, dividirPorMencoes, extrairMencoes } from "./mencoes";

const membros = comHandles([
  { user_id: "1", full_name: "Marcos Silva", email: "marcos@x.com" },
  { user_id: "2", full_name: "João Pereira", email: "joao@x.com" },
  { user_id: "3", full_name: "Ana Lima", email: "ana@x.com" },
  { user_id: "4", full_name: "Ana Souza", email: "ana2@x.com" },
]);

describe("handles", () => {
  it("usa o primeiro nome sem acento e desambigua repetidos", () => {
    const h = Object.fromEntries(membros.map((m) => [m.user_id, m.handle]));
    expect(h).toEqual({ "1": "marcos", "2": "joao", "3": "ana.lima", "4": "ana.souza" });
  });
});

describe("extrairMencoes", () => {
  it("reconhece @ no texto, ignorando acento e caixa", () => {
    const r = extrairMencoes("@Marcos ver com @joão sobre o fluxo", membros);
    expect(r.map((m) => m.user_id).sort()).toEqual(["1", "2"]);
  });
  it("não conta e-mail nem handle desconhecido", () => {
    expect(extrairMencoes("fale com fulano@marcos.com ou @ninguem", membros)).toEqual([]);
  });
  it("não repete a mesma pessoa", () => {
    expect(extrairMencoes("@marcos e de novo @marcos.", membros)).toHaveLength(1);
  });
});

describe("dividirPorMencoes", () => {
  it("separa o texto preservando tudo", () => {
    const p = dividirPorMencoes("oi @marcos, ok?", membros);
    expect(p.map((x) => x.texto).join("")).toBe("oi @marcos, ok?");
    expect(p.filter((x) => x.mencao).map((x) => x.texto)).toEqual(["@marcos"]);
  });
});

describe("consultaDeMencao", () => {
  it("detecta o @ sob o cursor", () => {
    expect(consultaDeMencao("ver com @ma", 11)).toEqual({ consulta: "ma", inicio: 8 });
    expect(consultaDeMencao("ver com @", 9)).toEqual({ consulta: "", inicio: 8 });
    expect(consultaDeMencao("email a@b", 9)).toBeNull();
    expect(consultaDeMencao("sem arroba", 5)).toBeNull();
  });
});
