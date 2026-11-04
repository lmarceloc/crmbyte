import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminFalso, type Chamada } from "@/lib/mcp/admin-falso";
import { acessoDe, autenticarChaveApi, gerarChave } from "./api-keys";

const cabecalhos = () => new Headers({ authorization: `Bearer ${gerarChave()}` });
const registro = (extra: Record<string, unknown> = {}) => ({
  id: "k1",
  account_id: "a1",
  user_id: "u1",
  last_used_at: null,
  account: { name: "Agência Byte" },
  ...extra,
});
const atualizacoes = (cs: Chamada[]) => cs.filter((c) => c.op === "update");

describe("acessoDe", () => {
  it("só reconhece os três níveis; o resto vale o mais restrito", () => {
    expect(acessoDe("leitura")).toBe("leitura");
    expect(acessoDe("escrita")).toBe("escrita");
    expect(acessoDe("entrada")).toBe("entrada");
    expect(acessoDe(undefined)).toBe("entrada");
    expect(acessoDe("admin")).toBe("entrada");
    expect(acessoDe(null)).toBe("entrada");
  });
});

describe("autenticarChaveApi", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("chave antiga, de antes da coluna `acesso`, continua valendo como entrada", async () => {
    const { admin } = adminFalso({ api_keys: { data: registro() } });
    expect(await autenticarChaveApi(admin, cabecalhos())).toMatchObject({ accountId: "a1", acesso: "entrada" });
  });

  it("devolve o nível gravado na chave", async () => {
    const { admin } = adminFalso({ api_keys: { data: registro({ acesso: "escrita" }) } });
    expect((await autenticarChaveApi(admin, cabecalhos()))?.acesso).toBe("escrita");
  });

  it("chave inexistente, revogada ou sem prefixo: null", async () => {
    expect(await autenticarChaveApi(adminFalso({ api_keys: { data: null } }).admin, cabecalhos())).toBeNull();
    expect(await autenticarChaveApi(adminFalso().admin, new Headers({ authorization: "Bearer outra" }))).toBeNull();
  });

  it("grava o último uso na primeira vez e depois só quando passa de um minuto", async () => {
    const nunca = adminFalso({ api_keys: { data: registro({ last_used_at: null }) } });
    await autenticarChaveApi(nunca.admin, cabecalhos());
    expect(atualizacoes(nunca.chamadas)).toHaveLength(1);

    const recente = adminFalso({ api_keys: { data: registro({ last_used_at: new Date(Date.now() - 20_000).toISOString() }) } });
    await autenticarChaveApi(recente.admin, cabecalhos());
    expect(atualizacoes(recente.chamadas)).toHaveLength(0);

    const antigo = adminFalso({ api_keys: { data: registro({ last_used_at: new Date(Date.now() - 120_000).toISOString() }) } });
    await autenticarChaveApi(antigo.admin, cabecalhos());
    expect(atualizacoes(antigo.chamadas)).toHaveLength(1);
  });
});
