import { describe, expect, it } from "vitest";
import { assuntoDoResumo, htmlDoResumo, textoDoResumo } from "./email";
import { semanaAnterior } from "./periodo";
import type { ResumoSemanal } from "./dados";

const resumo: ResumoSemanal = {
  negocios: { abertos: 12, valorAberto: 45000, novos: 4, ganhos: 1, perdidos: 2 },
  tarefas: { realizadas: 9, adiadas: 3, atrasadas: 2, pendentes: 7 },
  novosContatos: 5,
  cadencias: { ativas: 2, leadsEmCadencia: 14, emailsEnviados: 30, aberturas: 11 },
  temperatura: { frio: 6, morno: 4, quente: 2 },
  porDono: [{ nome: "Ana <b>", abertos: 8, quentes: 2, novos: 3, tarefasPendentes: 4 }],
};
const dados = {
  nomeDaConta: "Agência",
  moeda: "BRL",
  semana: semanaAnterior(new Date("2026-10-13T12:00:00Z")),
  resumo,
  urlDoPainel: "https://crm.exemplo.com/dashboard",
};

describe("e-mail do resumo semanal", () => {
  it("assunto traz a semana de segunda a domingo", () => {
    expect(assuntoDoResumo(dados)).toBe("Resumo semanal · Agência · 05/10/2026 a 11/10/2026");
  });
  it("html tem os números e escapa nomes", () => {
    const html = htmlDoResumo(dados);
    expect(html).toContain("Adiadas");
    expect(html).toContain("Ana &lt;b&gt;");
    expect(html).not.toContain("Ana <b>");
    expect(html).toContain("17%"); // 2 quentes de 12
  });
  it("texto lista os donos", () => {
    expect(textoDoResumo(dados)).toContain("- Ana <b>: 8 / 2 / 3 / 4");
  });
});
