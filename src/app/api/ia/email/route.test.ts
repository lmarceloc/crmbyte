import { beforeEach, describe, expect, it, vi } from "vitest";
import { IaError } from "@/lib/ia/erro";

// ---- dependências da rota, trocadas por falsos (nada aqui fala com Supabase, Firecrawl ou OpenRouter)
const requireRole = vi.fn();
vi.mock("@/lib/auth/account", () => ({
  requireRole: (min: string) => requireRole(min),
  toErrorResponse: (e: unknown) =>
    Response.json({ error: e instanceof Error ? e.message : "erro" }, { status: (e as { status?: number })?.status ?? 500 }),
}));
vi.mock("@/lib/automations/admin-client", () => ({ supabaseAdmin: () => ({}) }));

const obterChave = vi.fn();
vi.mock("@/lib/integracoes/chaves", () => ({
  obterChave: (_admin: unknown, _conta: string, provedor: string) => obterChave(provedor),
}));

const lerSite = vi.fn();
vi.mock("@/lib/ia/firecrawl", () => ({ lerSite: (...a: unknown[]) => lerSite(...a) }));
const completar = vi.fn();
vi.mock("@/lib/ia/openrouter", () => ({ completar: (...a: unknown[]) => completar(...a) }));

import { POST } from "./route";

const SKILL_A = "11111111-1111-4111-8111-111111111111";
const SKILL_B = "22222222-2222-4222-8222-222222222222";

const PERFIL = { company_name: "Agência Byte", what_we_do: "Tecnologia para vendas.", services: "Tráfego pago e automação." };

/**
 * Cliente Supabase falso: `ai_skills` devolve `select().eq().in()` com as linhas dadas;
 * `ai_company_profile` devolve `select().eq().maybeSingle()` com o perfil dado.
 */
function supabaseCom(
  linhas: { id: string; name: string; description?: string; content: string }[],
  erro: unknown = null,
  perfil: { company_name: string; what_we_do: string; services: string } | null = PERFIL,
  erroPerfil: unknown = null,
) {
  return {
    from: (tabela: string) => ({
      select: () => ({
        eq: () =>
          tabela === "ai_company_profile"
            ? { maybeSingle: async () => ({ data: perfil, error: erroPerfil }) }
            : { in: async () => ({ data: linhas, error: erro }) },
      }),
    }),
  };
}

const corpoOk = {
  lead_name: "Marlon Saling",
  lead_title: "Diretor Comercial",
  lead_linkedin: "",
  company_name: "Top Flex",
  company_site: "topflex.net",
  skill_ids: [] as string[],
};

const chamar = (corpo: unknown) =>
  POST(new Request("http://x/api/ia/email", { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase: supabaseCom([]) });
  obterChave.mockImplementation((p: string) => (p === "openrouter" ? "sk-or-1" : "fc-1"));
  lerSite.mockResolvedValue({ markdown: "Fabricamos pisos esportivos.", titulo: "Top Flex" });
  completar.mockResolvedValue("ASSUNTO: Pisos para a Top Flex\n\nOlá, Marlon!");
});

describe("POST /api/ia/email", () => {
  it("exige o papel de agent", async () => {
    await chamar(corpoOk);
    expect(requireRole).toHaveBeenCalledWith("agent");
  });

  it("gera o e-mail: normaliza o site, usa as duas chaves e devolve assunto e corpo", async () => {
    const r = await chamar(corpoOk);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      assunto: "Pisos para a Top Flex",
      corpo: "Olá, Marlon!",
      site_lido: true,
      aviso: null,
    });
    expect(lerSite).toHaveBeenCalledWith("fc-1", "https://topflex.net/");
    expect(completar.mock.calls[0][0]).toBe("sk-or-1");
  });

  it("o perfil da empresa (Configurações → IA) vai no pedido ao modelo: nome, o que faz e serviços", async () => {
    await chamar(corpoOk);
    const sistema = (completar.mock.calls[0][1] as { content: string }[])[0].content;
    expect(sistema).toContain("Agência Byte");
    expect(sistema).toContain("Tecnologia para vendas.");
    expect(sistema).toContain("Tráfego pago e automação.");
  });

  it("'o que a empresa faz' é opcional: só com nome e serviços já gera", async () => {
    requireRole.mockResolvedValue({
      accountId: "conta-1",
      userId: "u1",
      role: "agent",
      supabase: supabaseCom([], null, { company_name: "Agência Byte", what_we_do: "", services: "Tráfego pago." }),
    });
    expect((await chamar(corpoOk)).status).toBe(200);
  });

  it.each([
    ["sem nenhum perfil cadastrado", null],
    ["sem os serviços que a empresa oferece", { company_name: "Agência Byte", what_we_do: "Tecnologia.", services: "   " }],
    ["sem o nome da empresa", { company_name: "", what_we_do: "Tecnologia.", services: "Tráfego pago." }],
  ])("%s, pede para preencher Configurações → IA e não chama ninguém", async (_rotulo, perfil) => {
    requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase: supabaseCom([], null, perfil) });
    const r = await chamar(corpoOk);
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.code).toBe("ia_profile_missing");
    expect(corpo.error).toMatch(/Configurações → IA/);
    expect(lerSite).not.toHaveBeenCalled();
    expect(completar).not.toHaveBeenCalled();
  });

  it("erro do banco ao ler o perfil vira 500 amigável", async () => {
    requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase: supabaseCom([], null, null, { message: "boom" }) });
    expect((await chamar(corpoOk)).status).toBe(500);
  });

  it("sem a chave do OpenRouter, avisa onde cadastrar e não chama ninguém", async () => {
    obterChave.mockImplementation((p: string) => (p === "openrouter" ? null : "fc-1"));
    const r = await chamar(corpoOk);
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.code).toBe("openrouter_key_missing");
    expect(corpo.error).toMatch(/Chaves de API/);
    expect(lerSite).not.toHaveBeenCalled();
    expect(completar).not.toHaveBeenCalled();
  });

  it("sem a chave do Firecrawl, ainda gera o e-mail e avisa na tela", async () => {
    obterChave.mockImplementation((p: string) => (p === "openrouter" ? "sk-or-1" : null));
    const r = await chamar(corpoOk);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.site_lido).toBe(false);
    expect(corpo.aviso).toMatch(/Firecrawl/);
    expect(lerSite).not.toHaveBeenCalled();
    expect(completar).toHaveBeenCalled();
  });

  it("falha ao ler o site não impede o e-mail", async () => {
    lerSite.mockRejectedValue(new IaError("O site não retornou conteúdo legível."));
    const corpo = await (await chamar(corpoOk)).json();
    expect(corpo.site_lido).toBe(false);
    expect(corpo.aviso).toContain("O site não retornou conteúdo legível.");
  });

  it("repassa o limite do modelo gratuito como 429 com a mensagem pronta", async () => {
    completar.mockRejectedValue(new IaError("Limite do modelo gratuito atingido.", 429, "openrouter_rate_limit"));
    const r = await chamar(corpoOk);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ code: "openrouter_rate_limit", error: "Limite do modelo gratuito atingido." });
  });

  it("recusa site e LinkedIn inválidos antes de gastar chamadas", async () => {
    const site = await chamar({ ...corpoOk, company_site: "ftp://x.com" });
    expect(site.status).toBe(422);
    expect((await site.json()).error).toMatch(/Site inválido/);
    const li = await chamar({ ...corpoOk, lead_linkedin: "javascript:alert(1)" });
    expect(li.status).toBe(422);
    expect((await li.json()).error).toMatch(/LinkedIn inválido/);
    expect(completar).not.toHaveBeenCalled();
  });

  it("LinkedIn válido é normalizado e vai para o pedido ao modelo", async () => {
    await chamar({ ...corpoOk, lead_linkedin: "linkedin.com/in/marlon" });
    const mensagens = completar.mock.calls[0][1] as { content: string }[];
    expect(mensagens[1].content).toContain("https://linkedin.com/in/marlon");
  });

  it("campos obrigatórios, campo desconhecido e skill_ids que não são UUID dão 422", async () => {
    expect((await chamar({ ...corpoOk, lead_name: "  " })).status).toBe(422);
    expect((await chamar({ ...corpoOk, company_name: "" })).status).toBe(422);
    expect((await chamar({ ...corpoOk, extra: 1 })).status).toBe(422);
    expect((await chamar({ ...corpoOk, skill_ids: ["nao-e-uuid"] })).status).toBe(422);
    expect((await chamar({ ...corpoOk, skill_ids: Array(11).fill(SKILL_A) })).status).toBe(422);
    expect((await chamar("texto")).status).toBe(422);
  });

  it("carrega as skills da conta e as entrega ao modelo na ordem escolhida", async () => {
    requireRole.mockResolvedValue({
      accountId: "conta-1",
      userId: "u1",
      role: "agent",
      supabase: supabaseCom([
        { id: SKILL_A, name: "Tom de voz", description: "Estilo direto.", content: "Seja direto." },
        { id: SKILL_B, name: "Oferta", content: "Vendemos tráfego pago." },
      ]),
    });
    await chamar({ ...corpoOk, skill_ids: [SKILL_B, SKILL_A] });
    const sistema = (completar.mock.calls[0][1] as { content: string }[])[0].content;
    expect(sistema.indexOf("### Oferta")).toBeGreaterThan(-1);
    expect(sistema.indexOf("### Oferta")).toBeLessThan(sistema.indexOf("### Tom de voz"));
    expect(sistema).toContain("Para que serve: Estilo direto.");
  });

  it("skill que não existe mais (ou é de outra conta) dá 422", async () => {
    requireRole.mockResolvedValue({
      accountId: "conta-1",
      userId: "u1",
      role: "agent",
      supabase: supabaseCom([{ id: SKILL_A, name: "Tom de voz", content: "x" }]),
    });
    const r = await chamar({ ...corpoOk, skill_ids: [SKILL_A, SKILL_B] });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/não existe mais/);
    expect(completar).not.toHaveBeenCalled();
  });

  it("skills somando mais que o limite dão 422 com os números", async () => {
    requireRole.mockResolvedValue({
      accountId: "conta-1",
      userId: "u1",
      role: "agent",
      supabase: supabaseCom([{ id: SKILL_A, name: "Enorme", content: "x".repeat(24_001) }]),
    });
    const r = await chamar({ ...corpoOk, skill_ids: [SKILL_A] });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/24\.001.*24\.000/);
  });

  it("erro do banco ao ler skills vira 500 amigável", async () => {
    requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase: supabaseCom([], { message: "boom" }) });
    const r = await chamar({ ...corpoOk, skill_ids: [SKILL_A] });
    expect(r.status).toBe(500);
  });

  it("papel insuficiente ou sem login devolve o status do erro de autorização", async () => {
    requireRole.mockRejectedValue(Object.assign(new Error("This action requires the 'agent' role or higher"), { status: 403 }));
    const r = await chamar(corpoOk);
    expect(r.status).toBe(403);
    expect(completar).not.toHaveBeenCalled();
  });
});
