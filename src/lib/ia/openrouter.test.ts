import { describe, expect, it, vi } from "vitest";
import { IaError } from "./erro";
import { completar, MODELO_GRATUITO, URL_OPENROUTER } from "./openrouter";

const resposta = (corpo: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

const MSGS = [
  { role: "system" as const, content: "regras" },
  { role: "user" as const, content: "dados" },
];

describe("completar (OpenRouter)", () => {
  it("usa o modelo gratuito por padrão e devolve o texto", async () => {
    const fetchFn = resposta({ choices: [{ message: { content: "  ASSUNTO: Oi\n\nCorpo  " } }] });
    expect(await completar("sk-or-1", MSGS, { fetchFn })).toBe("ASSUNTO: Oi\n\nCorpo");

    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_OPENROUTER);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-1");
    const corpo = JSON.parse(init.body as string);
    expect(corpo.model).toBe("openrouter/free");
    expect(MODELO_GRATUITO).toBe("openrouter/free");
    expect(corpo.messages).toEqual(MSGS);
  });

  it("permite trocar o modelo", async () => {
    const fetchFn = resposta({ choices: [{ message: { content: "ok" } }] });
    await completar("k", MSGS, { fetchFn, modelo: "outro/modelo:free" });
    expect(JSON.parse((vi.mocked(fetchFn).mock.calls[0][1] as RequestInit).body as string).model).toBe("outro/modelo:free");
  });

  it.each([
    [401, "openrouter_key", /Chave do OpenRouter recusada/],
    [402, "openrouter_credits", /créditos/],
    [429, "openrouter_rate_limit", /Limite do modelo gratuito/],
    [503, "openrouter_failed", /HTTP 503/],
  ])("HTTP %i vira um erro legível (%s)", async (status, code, mensagem) => {
    const erro = await completar("k", MSGS, { fetchFn: resposta({ error: { message: "x" } }, status) }).catch((e) => e);
    expect(erro).toBeInstanceOf(IaError);
    expect(erro.code).toBe(code);
    expect(erro.message).toMatch(mensagem);
  });

  it("o limite estourado chega ao cliente como 429", async () => {
    const erro = await completar("k", MSGS, { fetchFn: resposta({}, 429) }).catch((e) => e);
    expect(erro.status).toBe(429);
  });

  it("erro dentro de um HTTP 200 também é tratado (o OpenRouter faz isso)", async () => {
    const limite = await completar("k", MSGS, { fetchFn: resposta({ error: { code: 429, message: "rate" } }) }).catch((e) => e);
    expect(limite.code).toBe("openrouter_rate_limit");
    const outro = await completar("k", MSGS, { fetchFn: resposta({ error: { code: 500, message: "quebrou" } }) }).catch((e) => e);
    expect(outro.code).toBe("openrouter_failed");
    expect(outro.message).toContain("quebrou");
  });

  it.each([{ choices: [] }, { choices: [{ message: { content: "  " } }] }, { choices: [{ message: {} }] }, {}])(
    "resposta sem texto é erro (%j)",
    async (corpo) => {
      const erro = await completar("k", MSGS, { fetchFn: resposta(corpo) }).catch((e) => e);
      expect(erro.code).toBe("openrouter_empty");
    },
  );

  it("falha de rede e tempo esgotado viram erros distintos", async () => {
    const rede = vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    expect((await completar("k", MSGS, { fetchFn: rede }).catch((e) => e)).message).toMatch(/falar com o OpenRouter/);
    const lenta = vi.fn(async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))) as unknown as typeof fetch;
    expect((await completar("k", MSGS, { fetchFn: lenta }).catch((e) => e)).message).toMatch(/demorou demais/);
  });
});
