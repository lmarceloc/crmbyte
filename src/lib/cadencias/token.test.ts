import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assinarToken, verificarToken } from "./token";

const payload = {
  fin: "pixel" as const,
  enrollment_id: "11111111-1111-4111-8111-111111111111",
  account_id: "22222222-2222-4222-8222-222222222222",
  cadence_id: "33333333-3333-4333-8333-333333333333",
  passo_id: "p1",
};

describe("token", () => {
  const antes = process.env.CADENCIA_TOKEN_SECRET;
  beforeEach(() => {
    process.env.CADENCIA_TOKEN_SECRET = "segredo-de-teste-com-16+";
  });
  afterEach(() => {
    process.env.CADENCIA_TOKEN_SECRET = antes;
  });

  it("round-trip e finalidade separada", () => {
    const t = assinarToken(payload);
    expect(verificarToken(t, "pixel")?.passo_id).toBe("p1");
    expect(verificarToken(t, "descadastro")).toBeNull();
  });
  it("recusa adulteração", () => {
    const t = assinarToken(payload);
    const [c, s] = t.split(".");
    expect(verificarToken(`${c}x.${s}`, "pixel")).toBeNull();
    expect(verificarToken("lixo", "pixel")).toBeNull();
  });
  it("falha fechado sem segredo", () => {
    delete process.env.CADENCIA_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(() => assinarToken(payload)).toThrow();
    expect(verificarToken("a.b", "pixel")).toBeNull();
  });
});
