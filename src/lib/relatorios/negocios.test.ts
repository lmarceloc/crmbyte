import { describe, expect, it } from "vitest"
import { agruparPorEmpresa, motivosDePerda, totais, type NegocioLinha } from "./negocios"

const n = (o: Partial<NegocioLinha>): NegocioLinha => ({
  id: Math.random().toString(), title: "x", value: 0, status: "open", created_at: "2026-01-01",
  closed_at: null, lost_reason: null, lost_note: null, company_id: "a", company_name: "Acme", ...o,
})

describe("relatório de negócios", () => {
  const dados = [
    n({ status: "won", value: 1000 }),
    n({ status: "won", value: 3000 }),
    n({ status: "lost", value: 500, lost_reason: "Preço" }),
    n({ status: "open", value: 200 }),
    n({ company_id: null, company_name: null, status: "lost", value: 100 }),
  ]
  it("agrega por empresa", () => {
    const [acme, sem] = agruparPorEmpresa(dados)
    expect(acme).toMatchObject({ total: 4, ganhos: 2, perdidos: 1, abertos: 1, vendido: 4000, ticketMedio: 2000, perdido: 500, valorAberto: 200 })
    expect(acme.conversao).toBeCloseTo(2 / 3)
    expect(sem.empresa).toBe("Sem empresa")
    expect(sem.ticketMedio).toBe(0)
  })
  it("conta motivos de perda", () => {
    expect(motivosDePerda(dados)).toEqual([
      { motivo: "Preço", quantidade: 1, valor: 500 },
      { motivo: "Sem motivo informado", quantidade: 1, valor: 100 },
    ])
  })
  it("totaliza", () => {
    const t = totais(agruparPorEmpresa(dados))
    expect(t).toMatchObject({ total: 5, vendido: 4000, ticketMedio: 2000 })
  })
})
