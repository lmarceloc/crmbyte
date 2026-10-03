import { describe, expect, it } from "vitest";
import { ehLeadQuenteNovo } from "./hot-leads";

describe("ehLeadQuenteNovo", () => {
  const visto = "2026-10-03T12:00:00.000Z";

  it("é novo quando abriu depois da última visita", () => {
    expect(ehLeadQuenteNovo("2026-10-03T12:00:01.000Z", visto)).toBe(true);
  });

  it("não é novo quando a última abertura é anterior ou igual à visita", () => {
    expect(ehLeadQuenteNovo("2026-10-03T11:59:59.000Z", visto)).toBe(false);
    expect(ehLeadQuenteNovo(visto, visto)).toBe(false);
  });

  it("sem visita registrada, todo lead com abertura é novo", () => {
    expect(ehLeadQuenteNovo("2026-10-01T00:00:00.000Z", null)).toBe(true);
  });

  it("sem abertura registrada nunca é novo", () => {
    expect(ehLeadQuenteNovo(null, null)).toBe(false);
  });
});
