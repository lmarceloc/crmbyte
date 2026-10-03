import { describe, expect, it } from "vitest";
import { diasNaEtapa, nivelDiasNaEtapa, rotuloDiasNaEtapa } from "./dias-na-etapa";

describe("diasNaEtapa", () => {
  const agora = new Date(2026, 9, 10, 9, 0); // 10/10/2026 09:00 local

  it("conta dias de calendário, não períodos de 24h", () => {
    expect(diasNaEtapa(new Date(2026, 9, 9, 23, 0).toISOString(), agora)).toBe(1);
    expect(diasNaEtapa(new Date(2026, 9, 10, 0, 5).toISOString(), agora)).toBe(0);
    expect(diasNaEtapa(new Date(2026, 9, 1, 12, 0).toISOString(), agora)).toBe(9);
  });

  it("nunca fica negativo (relógio do cliente atrasado)", () => {
    expect(diasNaEtapa(new Date(2026, 9, 11).toISOString(), agora)).toBe(0);
  });

  it("devolve null sem data ou com data inválida", () => {
    expect(diasNaEtapa(undefined, agora)).toBeNull();
    expect(diasNaEtapa(null, agora)).toBeNull();
    expect(diasNaEtapa("não é data", agora)).toBeNull();
  });
});

describe("rotuloDiasNaEtapa", () => {
  it("usa Hoje / singular / plural", () => {
    expect(rotuloDiasNaEtapa(0)).toBe("Hoje");
    expect(rotuloDiasNaEtapa(1)).toBe("1 dia");
    expect(rotuloDiasNaEtapa(12)).toBe("12 dias");
  });
});

describe("nivelDiasNaEtapa", () => {
  it("escala em 7 e 14 dias", () => {
    expect(nivelDiasNaEtapa(6)).toBe("normal");
    expect(nivelDiasNaEtapa(7)).toBe("alerta");
    expect(nivelDiasNaEtapa(13)).toBe("alerta");
    expect(nivelDiasNaEtapa(14)).toBe("critico");
  });
});
