import { describe, expect, it } from "vitest";
import { avancarDiasUteis } from "./dias-uteis";

describe("avancarDiasUteis", () => {
  it("pula fim de semana e preserva a hora", () => {
    // sexta 2026-10-02 14:30Z + 1 dia útil => segunda 2026-10-05
    expect(avancarDiasUteis(new Date("2026-10-02T14:30:00Z"), 1).toISOString()).toBe("2026-10-05T14:30:00.000Z");
  });
  it("pula feriado (12/10)", () => {
    expect(avancarDiasUteis(new Date("2026-10-09T10:00:00Z"), 1).toISOString()).toBe("2026-10-13T10:00:00.000Z");
  });
});
