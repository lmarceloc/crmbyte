import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ehProvedor, PROVEDORES, statusChaves } from "./chaves";

/** Admin falso: `from("integration_keys").select().eq()` resolve com as linhas dadas. */
function adminCom(linhas: { provider: string; key_hint: string | null; updated_at: string }[]) {
  const consulta = { select: () => consulta, eq: async () => ({ data: linhas }) };
  return { from: () => consulta } as unknown as SupabaseClient;
}

describe("provedores de chave", () => {
  it("o OpenRouter é um provedor válido, ao lado do Apify e da Treg", () => {
    expect(PROVEDORES).toEqual(["apify", "treg", "openrouter"]);
    expect(ehProvedor("openrouter")).toBe(true);
    expect(ehProvedor("apify")).toBe(true);
  });

  it("recusa o que não é provedor conhecido", () => {
    expect(ehProvedor("openai")).toBe(false);
    expect(ehProvedor("")).toBe(false);
    expect(ehProvedor(undefined)).toBe(false);
  });
});

describe("statusChaves", () => {
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
