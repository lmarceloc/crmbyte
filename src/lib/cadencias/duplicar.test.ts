import { describe, expect, it } from "vitest";
import { nomeDaCopia } from "./duplicar";

describe("nomeDaCopia", () => {
  it("acrescenta _copia", () => expect(nomeDaCopia("Prospecção B2B")).toBe("Prospecção B2B_copia"));
  it("não passa de 160 caracteres", () => {
    const n = nomeDaCopia("a".repeat(160));
    expect(n).toHaveLength(160);
    expect(n.endsWith("_copia")).toBe(true);
  });
});
