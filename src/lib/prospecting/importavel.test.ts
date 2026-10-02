import { describe, expect, it } from "vitest";
import { MSG_PEDIU_PARA_SAIR } from "./errors";
import { avaliarImportacaoB2b, leadB2bImportavel, MSG_AINDA_PROCURANDO_EMAIL } from "./importavel";

const cand = (o: Partial<{ status: string; contact_id: string | null; error: string | null; deal_id: string | null }>) => ({
  status: "new",
  contact_id: null,
  error: null,
  deal_id: null,
  ...o,
});

describe("avaliarImportacaoB2b", () => {
  it("lead com e-mail verificado já tem contato: importa direto", () => {
    expect(avaliarImportacaoB2b(cand({ status: "enriched", contact_id: "c1" }))).toEqual({
      ok: true,
      precisaCriarContato: false,
    });
  });

  it("lead que ficou sem e-mail verificado (skipped ou failed) é importável e pede contato novo", () => {
    for (const status of ["skipped", "failed"]) {
      expect(avaliarImportacaoB2b(cand({ status, error: "Sem e-mail comercial verificado." }))).toEqual({
        ok: true,
        precisaCriarContato: true,
      });
    }
  });

  it("lead ainda na fila de revelação espera: o e-mail pode chegar e duplicaria o contato", () => {
    expect(avaliarImportacaoB2b(cand({ status: "new" }))).toEqual({ ok: false, motivo: MSG_AINDA_PROCURANDO_EMAIL });
  });

  it("quem pediu para não ser contatado nunca vira contato novo por este caminho", () => {
    expect(avaliarImportacaoB2b(cand({ status: "skipped", error: MSG_PEDIU_PARA_SAIR }))).toEqual({
      ok: false,
      motivo: MSG_PEDIU_PARA_SAIR,
    });
  });

  it("estado desconhecido não importa", () => {
    expect(avaliarImportacaoB2b(cand({ status: "sending" })).ok).toBe(false);
  });
});

describe("leadB2bImportavel", () => {
  it("só aparece para quem ainda não está no funil", () => {
    expect(leadB2bImportavel(cand({ status: "skipped" }))).toBe(true);
    expect(leadB2bImportavel(cand({ status: "skipped", deal_id: "d1" }))).toBe(false);
    expect(leadB2bImportavel(cand({ status: "enriched", contact_id: "c1", deal_id: "d1" }))).toBe(false);
  });
});
