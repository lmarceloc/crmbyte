import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assinarToken, verificarToken } from "./token";
import { linkificarComRastreio } from "./worker";

describe("clique", () => {
  const antes = process.env.CADENCIA_TOKEN_SECRET;
  beforeEach(() => {
    process.env.CADENCIA_TOKEN_SECRET = "segredo-de-teste-com-16+";
  });
  afterEach(() => {
    process.env.CADENCIA_TOKEN_SECRET = antes;
  });
  const base = {
    enrollment_id: "11111111-1111-4111-8111-111111111111",
    account_id: "22222222-2222-4222-8222-222222222222",
    cadence_id: "33333333-3333-4333-8333-333333333333",
    passo_id: "p1",
  };

  it("token de clique carrega a URL e não serve de pixel", () => {
    const t = assinarToken({ ...base, fin: "clique", url: "https://x.com/a?b=1&c=2" });
    expect(verificarToken(t, "clique")?.url).toBe("https://x.com/a?b=1&c=2");
    expect(verificarToken(t, "pixel")).toBeNull();
  });

  it("linkifica URLs, tira pontuação final e desfaz &amp;", () => {
    const visto: string[] = [];
    const html = linkificarComRastreio(
      "veja https://x.com/a?b=1&amp;c=2. Obrigado",
      (u) => {
        visto.push(u);
        return "TOKEN";
      },
      "https://app.com",
    );
    expect(visto).toEqual(["https://x.com/a?b=1&c=2"]);
    expect(html).toBe('veja <a href="https://app.com/api/cadencias/click/TOKEN">https://x.com/a?b=1&amp;c=2</a>. Obrigado');
  });
});
