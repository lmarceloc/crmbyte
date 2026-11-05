import { describe, expect, it } from "vitest";
import { situacaoDoEmail } from "./treg";
import { emailNaoConfirmado } from "./contato-b2b";
import type { Lead } from "./treg";

describe("situacaoDoEmail", () => {
  it("lê o formato da Treg/Hunter (data.status)", () => {
    // resposta real: domínio catch-all
    const aceitaTudo = {
      data: { status: "accept_all", score: 73, email: "gabriel.freire@ibema.com.br", accept_all: true, result: "risky" },
      meta: { params: { email: "gabriel.freire@ibema.com.br" } },
    };
    expect(situacaoDoEmail(aceitaTudo)).toBe("aceita_tudo");
    expect(situacaoDoEmail({ data: { status: "valid" } })).toBe("valido");
    expect(situacaoDoEmail({ data: { status: "invalid" } })).toBe("invalido");
    expect(situacaoDoEmail({ data: { status: "unknown" } })).toBe("desconhecido");
  });

  it("aceita o status sem o envelope data e o legado valid", () => {
    expect(situacaoDoEmail({ status: "valid" })).toBe("valido");
    expect(situacaoDoEmail({ valid: true })).toBe("valido");
    expect(situacaoDoEmail({ valid: false })).toBe("invalido");
    expect(situacaoDoEmail({ data: { verification: { status: "accept_all" } } })).toBe("aceita_tudo");
  });

  it("resposta vazia ou estranha é desconhecida", () => {
    expect(situacaoDoEmail(null)).toBe("desconhecido");
    expect(situacaoDoEmail("ok")).toBe("desconhecido");
    expect(situacaoDoEmail({})).toBe("desconhecido");
  });
});

describe("emailNaoConfirmado", () => {
  const base = { key: "k", fullName: "A B", title: null, companyName: null, companyDomain: null, location: null, linkedin: null, emailVerified: false } as Lead;
  it("leva o e-mail achado na revelação e não confirmado", () => {
    expect(emailNaoConfirmado({ ...base, email: "a@b.com", emailStatus: "aceita_tudo" })).toBe("a@b.com");
  });
  it("não leva e-mail que veio só da busca", () => {
    expect(emailNaoConfirmado({ ...base, email: "a@b.com" })).toBeNull();
  });
});
