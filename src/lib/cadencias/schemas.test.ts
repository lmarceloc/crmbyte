import { describe, expect, it } from "vitest";
import { editarCadenciaSchema, passosSchema } from "./schemas";

describe("schemas da cadência", () => {
  it("aceita ramo recursivo", () => {
    const r = passosSchema.safeParse([
      {
        id: "r",
        tipo: "ramo",
        condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
        sim: [{ id: "e", tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false }],
        nao: [],
      },
    ]);
    expect(r.success).toBe(true);
  });
  it("recusa espera fora do limite e edição vazia", () => {
    expect(passosSchema.safeParse([{ id: "x", tipo: "espera", diasUteis: 0 }]).success).toBe(false);
    expect(editarCadenciaSchema.safeParse({}).success).toBe(false);
  });
});
