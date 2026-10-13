import { describe, expect, it } from "vitest";
import { formatarDia, horaDeEnviar, semanaAnterior } from "./periodo";

describe("semanaAnterior", () => {
  it("numa quarta, pega de segunda a segunda da semana passada (Brasília)", () => {
    const s = semanaAnterior(new Date("2026-10-14T15:00:00Z")); // qua 12h BRT
    expect(s.chave).toBe("2026-10-05");
    expect(s.inicio.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(s.fim.toISOString()).toBe("2026-10-12T03:00:00.000Z");
  });
  it("domingo 23h BRT (segunda em UTC) ainda é a semana corrente", () => {
    expect(semanaAnterior(new Date("2026-10-12T02:00:00Z")).chave).toBe("2026-09-28");
  });
  it("segunda 00h BRT já fecha a semana", () => {
    expect(semanaAnterior(new Date("2026-10-12T03:00:00Z")).chave).toBe("2026-10-05");
  });
});

describe("horaDeEnviar", () => {
  it("segunda 7h59 BRT não; 8h sim", () => {
    expect(horaDeEnviar(new Date("2026-10-12T10:59:00Z"))).toBe(false);
    expect(horaDeEnviar(new Date("2026-10-12T11:00:00Z"))).toBe(true);
  });
  it("resto da semana: sim (recupera se o cron ficou parado na segunda)", () => {
    expect(horaDeEnviar(new Date("2026-10-15T12:00:00Z"))).toBe(true);
  });
});

it("formatarDia usa o dia de Brasília", () => {
  expect(formatarDia(new Date("2026-10-12T02:00:00Z"))).toBe("11/10/2026");
});
