import { describe, expect, it } from "vitest";
import { situacaoNoPais } from "./pais";

describe("situacaoNoPais", () => {
  it("reconhece o Brasil pelo nome, sigla, estado ou UF", () => {
    expect(situacaoNoPais("São Paulo, São Paulo, Brazil", "BR")).toBe("dentro");
    expect(situacaoNoPais("Curitiba, PR, BR", "BR")).toBe("dentro");
    expect(situacaoNoPais("Curitiba, PR", "BR")).toBe("dentro");
    expect(situacaoNoPais("Recife, PE", "BR")).toBe("dentro");
    expect(situacaoNoPais("Porto Alegre, Rio Grande do Sul", "BR")).toBe("dentro");
    expect(situacaoNoPais("Brasil", "BR")).toBe("dentro");
  });

  it("descarta quem está em outro país", () => {
    expect(situacaoNoPais("Buenos Aires, Argentina", "BR")).toBe("fora");
    expect(situacaoNoPais("Córdoba, X, AR", "BR")).toBe("fora");
    expect(situacaoNoPais("Greater Buenos Aires Argentina", "BR")).toBe("fora");
    expect(situacaoNoPais("Austin, Texas, United States", "BR")).toBe("fora");
    expect(situacaoNoPais("Curitiba, PR, BR", "AR")).toBe("fora");
  });

  it("na dúvida, mantém o lead", () => {
    expect(situacaoNoPais(null, "BR")).toBe("desconhecido");
    expect(situacaoNoPais("Remote", "BR")).toBe("desconhecido");
    expect(situacaoNoPais("PR", "AR")).toBe("desconhecido");
  });

  it("sigla de país no meio não confunde com UF", () => {
    expect(situacaoNoPais("Recife, PE, BR", "PE")).toBe("fora");
    expect(situacaoNoPais("Lima, Lima, PE", "PE")).toBe("dentro");
  });
});
