import { describe, expect, it } from "vitest";
import { diasRestantes } from "./banner-teste-gratis";

describe("diasRestantes", () => {
  const agora = new Date("2026-10-27T12:00:00Z").getTime();
  it("arredonda para cima e não fica negativo", () => {
    expect(diasRestantes("2026-11-03T12:00:00Z", agora)).toBe(7);
    expect(diasRestantes("2026-10-27T14:00:00Z", agora)).toBe(1);
    expect(diasRestantes("2026-10-26T12:00:00Z", agora)).toBe(0);
  });
});
