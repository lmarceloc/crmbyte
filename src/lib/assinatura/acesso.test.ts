import { describe, expect, it } from "vitest";
import { avaliarAcesso } from "./acesso";

const AGORA = new Date("2026-10-27T12:00:00Z");
const linha = (o: Partial<{ status: string; teste_ate: string | null; isenta: boolean }> = {}) => ({
  status: "sem_assinatura",
  teste_ate: null,
  isenta: false,
  ...o,
});

describe("avaliarAcesso", () => {
  it("libera dentro dos 7 dias grátis e bloqueia depois", () => {
    expect(avaliarAcesso(linha({ teste_ate: "2026-10-30T00:00:00Z" }), AGORA)).toMatchObject({ liberado: true, motivo: "teste" });
    expect(avaliarAcesso(linha({ teste_ate: "2026-10-27T11:59:59Z" }), AGORA)).toMatchObject({
      liberado: false,
      motivo: "teste_acabou",
    });
    expect(avaliarAcesso(linha({ status: "pendente", teste_ate: null }), AGORA).liberado).toBe(false);
  });

  it("assinatura ativa libera mesmo com o teste vencido; cobrança recusada ainda libera", () => {
    expect(avaliarAcesso(linha({ status: "ativa", teste_ate: "2026-01-01T00:00:00Z" }), AGORA)).toMatchObject({
      liberado: true,
      motivo: "assinante",
    });
    expect(avaliarAcesso(linha({ status: "pagamento_falhou" }), AGORA).liberado).toBe(true);
  });

  it("cancelada com o teste vencido bloqueia com o motivo certo", () => {
    expect(avaliarAcesso(linha({ status: "cancelada", teste_ate: "2026-10-01T00:00:00Z" }), AGORA)).toMatchObject({
      liberado: false,
      motivo: "cancelada",
    });
  });

  it("conta isenta sempre libera; sem registro não tranca ninguém", () => {
    expect(avaliarAcesso(linha({ isenta: true, status: "cancelada" }), AGORA)).toMatchObject({ liberado: true, motivo: "isenta" });
    expect(avaliarAcesso(null, AGORA)).toMatchObject({ liberado: true, motivo: "sem_registro" });
  });
});
