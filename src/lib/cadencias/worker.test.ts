import { describe, expect, it } from "vitest";
import { assuntoDaResposta, avaliarRamo, corpoEmHtml } from "./worker";
import type { Passo, PassoRamo } from "./tipos";

const ramo = (c: PassoRamo["condicao"]): PassoRamo => ({ id: "r", tipo: "ramo", condicao: c, sim: [], nao: [] });
const agora = new Date("2026-10-10T12:00:00Z");

describe("avaliarRamo", () => {
  it("abriu: sim quando atingiu, não quando o prazo venceu, null enquanto espera", () => {
    const c = { tipo: "abriu", vezes: 2, dentroDeDias: 3 } as const;
    expect(avaliarRamo(ramo(c), { ultimo_email_em: "2026-10-09T12:00:00Z", aberturas: 2 }, agora)).toBe(true);
    expect(avaliarRamo(ramo(c), { ultimo_email_em: "2026-10-09T12:00:00Z", aberturas: 1 }, agora)).toBeNull();
    expect(avaliarRamo(ramo(c), { ultimo_email_em: "2026-10-01T12:00:00Z", aberturas: 1 }, agora)).toBe(false);
  });
  it("sem e-mail anterior decide já; clicou/respondeu nunca é sim", () => {
    expect(avaliarRamo(ramo({ tipo: "abriu", vezes: 1, dentroDeDias: 1 }), { ultimo_email_em: null, aberturas: 0 }, agora)).toBe(false);
    expect(avaliarRamo(ramo({ tipo: "clicou", dentroDeDias: 1 }), { ultimo_email_em: "2026-10-01T00:00:00Z", aberturas: 9 }, agora)).toBe(false);
  });
});

describe("e-mail", () => {
  it("assuntoDaResposta renderiza variáveis do assunto cru", () => {
    const passos: Passo[] = [{ id: "e", tipo: "email", assunto: "Olá {{primeiro_nome}}", corpo: "x", mesmaConversa: false }];
    expect(assuntoDaResposta(passos, "e", { primeiro_nome: "Ana" })).toBe("Re: Olá Ana");
    expect(assuntoDaResposta(passos, null, {})).toBe("Re:");
  });
  it("corpoEmHtml escapa HTML", () => {
    expect(corpoEmHtml("<b>a</b>\nb")).toBe("&lt;b&gt;a&lt;/b&gt;<br>\nb");
  });
});
