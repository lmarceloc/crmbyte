import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ehProvedor, PROVEDORES, statusChaves } from "./chaves";

/** Admin falso: `from("integration_keys").select().eq()` resolve com as linhas dadas. */
function adminCom(linhas: { provider: string; key_hint: string | null; updated_at: string }[]) {
  const consulta = { select: () => consulta, eq: async () => ({ data: linhas }) };
  return { from: () => consulta } as unknown as SupabaseClient;
}

describe("provedores de chave", () => {
  it("OpenRouter, Firecrawl e Analisar Deals são provedores válidos, ao lado do Apify e da Treg", () => {
    expect(PROVEDORES).toEqual(["apify", "treg", "openrouter", "firecrawl", "analisar_deals"]);
    expect(ehProvedor("openrouter")).toBe(true);
    expect(ehProvedor("firecrawl")).toBe(true);
    expect(ehProvedor("analisar_deals")).toBe(true);
    expect(ehProvedor("apify")).toBe(true);
  });

  it("recusa o que não é provedor conhecido", () => {
    expect(ehProvedor("openai")).toBe(false);
    expect(ehProvedor("")).toBe(false);
    expect(ehProvedor(undefined)).toBe(false);
  });
});

describe("statusChaves", () => {
  it("a chave do Analisar Deals só existe se a conta cadastrou (não há chave da instalação)", async () => {
    const status = await statusChaves(adminCom([]), "conta-1");
    expect(status.find((s) => s.provider === "analisar_deals")).toEqual({
      provider: "analisar_deals",
      configurada: false,
      origem: null,
      hint: null,
      updated_at: null,
    });
  });

  it("lista o OpenRouter como não configurado quando a conta não cadastrou a chave", async () => {
    const status = await statusChaves(adminCom([]), "conta-1");
    expect(status.find((s) => s.provider === "openrouter")).toEqual({
      provider: "openrouter",
      configurada: false,
      origem: null,
      hint: null,
      updated_at: null,
    });
  });

  it("mostra só os 4 últimos caracteres da chave cadastrada", async () => {
    const status = await statusChaves(
      adminCom([{ provider: "openrouter", key_hint: "ab12", updated_at: "2026-10-05T18:00:00Z" }]),
      "conta-1",
    );
    expect(status.find((s) => s.provider === "openrouter")).toEqual({
      provider: "openrouter",
      configurada: true,
      origem: "conta",
      hint: "ab12",
      updated_at: "2026-10-05T18:00:00Z",
    });
    expect(status.find((s) => s.provider === "apify")?.configurada).toBe(false);
  });
});

describe("chave do Firecrawl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem chave na conta nem no ambiente, aparece como não configurada", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const status = await statusChaves(adminCom([]), "conta-1");
    expect(status.find((s) => s.provider === "firecrawl")).toMatchObject({ configurada: false, origem: null });
  });

  it("usa FIRECRAWL_API_KEY da instalação quando a conta não cadastrou a sua", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "  fc-da-instalacao  ");
    const status = await statusChaves(adminCom([]), "conta-1");
    expect(status.find((s) => s.provider === "firecrawl")).toEqual({
      provider: "firecrawl",
      configurada: true,
      origem: "instalacao",
      hint: null,
      updated_at: null,
    });
  });

  it("a chave cadastrada na conta vale mais que a da instalação", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-da-instalacao");
    const status = await statusChaves(
      adminCom([{ provider: "firecrawl", key_hint: "9z9z", updated_at: "2026-10-05T19:00:00Z" }]),
      "conta-1",
    );
    expect(status.find((s) => s.provider === "firecrawl")).toMatchObject({
      configurada: true,
      origem: "conta",
      hint: "9z9z",
    });
  });

  it("FIRECRAWL_API_KEY não vaza para os outros provedores", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-da-instalacao");
    const status = await statusChaves(adminCom([]), "conta-1");
    for (const p of ["apify", "openrouter"]) {
      expect(status.find((s) => s.provider === p)).toMatchObject({ configurada: false });
    }
  });
});
