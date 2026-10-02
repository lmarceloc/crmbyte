import { describe, expect, it } from "vitest";
import { dentroDaJanela } from "./janela";
import { configuracaoPadrao } from "./tipos";

describe("dentroDaJanela", () => {
  const cfg = configuracaoPadrao(); // seg-sex 08-18 America/Sao_Paulo
  it("dentro em dia útil comercial (BRT = UTC-3)", () => {
    expect(dentroDaJanela(new Date("2026-10-05T15:00:00Z"), cfg)).toBe(true); // seg 12:00
  });
  it("fora de horário e fora de dia", () => {
    expect(dentroDaJanela(new Date("2026-10-05T23:00:00Z"), cfg)).toBe(false); // seg 20:00
    expect(dentroDaJanela(new Date("2026-10-04T15:00:00Z"), cfg)).toBe(false); // dom
  });
});
