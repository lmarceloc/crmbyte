import { describe, expect, it, vi } from "vitest";
import { IaError } from "./erro";
import { gerarEmail } from "./gerar-email";

const entrada = {
  sobreNos: { nome: "Agência Byte", oQueFaz: "Tecnologia para vendas.", servicos: "Tráfego pago e automação." },
  lead: { nomeDoLead: "Marlon Saling", cargo: "Diretor", linkedin: "", empresa: "Top Flex", site: "https://topflex.net/" },
  skills: [{ nome: "Tom de voz", descricao: "Estilo direto.", conteudo: "Seja direto." }],
};

const deps = (over: Partial<Parameters<typeof gerarEmail>[1]> = {}) => ({
  lerSite: vi.fn(async () => ({ markdown: "Fabricamos pisos esportivos.", titulo: "Top Flex" })),
  completar: vi.fn(async () => "ASSUNTO: Pisos para a Top Flex\n\nOlá, Marlon!"),
  ...over,
});

describe("gerarEmail", () => {
  it("lê o site, pede o e-mail com site + lead + skills e devolve assunto e corpo", async () => {
    const d = deps();
    const r = await gerarEmail(entrada, d);
    expect(r).toEqual({ assunto: "Pisos para a Top Flex", corpo: "Olá, Marlon!", siteLido: true, aviso: null });

    expect(d.lerSite).toHaveBeenCalledWith("https://topflex.net/");
    const mensagens = vi.mocked(d.completar).mock.calls[0][0];
    expect(mensagens[0].content).toContain("Seja direto.");
    expect(mensagens[0].content).toContain("Agência Byte");
    expect(mensagens[0].content).toContain("Tráfego pago e automação.");
    expect(mensagens[1].content).toContain("Fabricamos pisos esportivos.");
    expect(mensagens[1].content).toContain("Marlon Saling");
  });

  it("se o site não puder ser lido, ainda gera o e-mail e avisa o motivo", async () => {
    const d = deps({ lerSite: vi.fn(async () => Promise.reject(new IaError("Chave do Firecrawl recusada."))) });
    const r = await gerarEmail(entrada, d);
    expect(r.siteLido).toBe(false);
    expect(r.aviso).toContain("Chave do Firecrawl recusada.");
    expect(r.corpo).toBe("Olá, Marlon!");
    expect(vi.mocked(d.completar).mock.calls[0][0][1].content).toContain("Não foi possível ler o site");
  });

  it("erro inesperado ao ler o site também não impede o e-mail", async () => {
    const d = deps({ lerSite: vi.fn(async () => Promise.reject(new Error("boom"))) });
    const r = await gerarEmail(entrada, d);
    expect(r.siteLido).toBe(false);
    expect(r.aviso).toContain("erro inesperado");
  });

  it("falha do modelo (limite, chave…) sobe como erro: sem modelo não há e-mail", async () => {
    const d = deps({ completar: vi.fn(async () => Promise.reject(new IaError("Limite do modelo gratuito atingido.", 429))) });
    await expect(gerarEmail(entrada, d)).rejects.toMatchObject({ status: 429 });
  });

  it("e-mail vazio do modelo é erro", async () => {
    const d = deps({ completar: vi.fn(async () => "ASSUNTO: Só o assunto") });
    await expect(gerarEmail(entrada, d)).rejects.toMatchObject({ code: "ia_empty" });
  });
});
