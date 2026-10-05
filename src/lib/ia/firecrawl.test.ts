import { describe, expect, it, vi } from "vitest";
import { IaError } from "./erro";
import { lerSite, URL_FIRECRAWL } from "./firecrawl";

const resposta = (corpo: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe("lerSite (Firecrawl)", () => {
  it("chama o scrape v2 com a chave, pedindo só o conteúdo principal em Markdown", async () => {
    const fetchFn = resposta({ success: true, data: { markdown: "# Top Flex\nPisos.", metadata: { title: "Top Flex" } } });
    const r = await lerSite("fc-123", "https://topflex.net/", { fetchFn });
    expect(r).toEqual({ markdown: "# Top Flex\nPisos.", titulo: "Top Flex" });

    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_FIRECRAWL);
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fc-123");
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://topflex.net/",
      formats: ["markdown"],
      onlyMainContent: true,
    });
  });

  it("título ausente vira null", async () => {
    const r = await lerSite("k", "https://x.com", { fetchFn: resposta({ success: true, data: { markdown: "oi" } }) });
    expect(r.titulo).toBeNull();
  });

  it.each([
    [401, "firecrawl_key", /Chave do Firecrawl recusada/],
    [403, "firecrawl_key", /Chave do Firecrawl recusada/],
    [402, "firecrawl_credits", /sem créditos/],
    [429, "firecrawl_rate_limit", /Limite de uso/],
    [500, "firecrawl_failed", /HTTP 500/],
  ])("HTTP %i vira um erro legível (%s)", async (status, code, mensagem) => {
    const erro = await lerSite("k", "https://x.com", { fetchFn: resposta({ error: "falhou" }, status) }).catch((e) => e);
    expect(erro).toBeInstanceOf(IaError);
    expect(erro.code).toBe(code);
    expect(erro.message).toMatch(mensagem);
  });

  it("success:false com HTTP 200 também é erro, e mostra o detalhe do Firecrawl", async () => {
    const erro = await lerSite("k", "https://x.com", { fetchFn: resposta({ success: false, error: "Site bloqueado" }) }).catch((e) => e);
    expect(erro.code).toBe("firecrawl_failed");
    expect(erro.message).toContain("Site bloqueado");
  });

  it("página sem texto é erro", async () => {
    const erro = await lerSite("k", "https://x.com", { fetchFn: resposta({ success: true, data: { markdown: "   " } }) }).catch((e) => e);
    expect(erro.code).toBe("firecrawl_empty");
  });

  it("resposta que não é JSON não derruba o código", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>oops</html>", { status: 502 })) as unknown as typeof fetch;
    const erro = await lerSite("k", "https://x.com", { fetchFn }).catch((e) => e);
    expect(erro.code).toBe("firecrawl_failed");
  });

  it("falha de rede e tempo esgotado viram erros distintos", async () => {
    const rede = vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    expect((await lerSite("k", "https://x.com", { fetchFn: rede }).catch((e) => e)).message).toMatch(/falar com o Firecrawl/);
    const lenta = vi.fn(async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))) as unknown as typeof fetch;
    expect((await lerSite("k", "https://x.com", { fetchFn: lenta }).catch((e) => e)).message).toMatch(/demorou demais/);
  });
});
