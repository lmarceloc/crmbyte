import { describe, expect, it } from "vitest";
import { ACOES, montarPerguntas, notaDoNivel, PERGUNTAS_DE_SCORE, rotuloDoNivel, ultimoNivel } from "./perguntas";
import { CRITERIOS_DE_IA } from "./criterios";
import { montarEstado, montarSinais, ocultarContatos, resumirNegocio, type NegocioBruto } from "./sinais";

const AGORA = new Date(2026, 9, 6, 12, 0, 0); // 06/10/2026, meio-dia local
const antes = (dias: number, hora = 10) => new Date(2026, 9, 6 - dias, hora, 0, 0).toISOString();

const bruto = (extra: Partial<NegocioBruto> = {}): NegocioBruto => ({
  id: "d1",
  title: "Top Flex",
  value: "42000.00",
  currency: "BRL",
  notes: null,
  expected_close_date: null,
  temperature: null,
  stage_id: "e1",
  stage_entered_at: antes(4),
  updated_at: antes(2),
  created_at: antes(30),
  assigned_to: null,
  stage: { name: "Proposta" },
  company: { name: "Top Flex Ltda" },
  contact: { name: "Ana", contact_notes: [], conversations: [] },
  enrollments: [],
  tarefas: [],
  ...extra,
});

describe("montarSinais", () => {
  it("lê os dados do próprio negócio (aceita embed como objeto ou lista)", () => {
    const s = montarSinais(bruto({ stage: [{ name: "Proposta" }], company: [{ name: "Top Flex Ltda" }] }), AGORA);
    expect(s).toMatchObject({
      id: "d1",
      titulo: "Top Flex",
      empresa: "Top Flex Ltda",
      contato: "Ana",
      etapa: "Proposta",
      valor: 42000,
      moeda: "BRL",
      diasNaEtapa: 4,
      diasSemAtualizar: 2,
      temperatura: null,
    });
  });

  it("sem nenhuma interação: diasSemContato é null (nunca houve contato)", () => {
    expect(montarSinais(bruto(), AGORA).diasSemContato).toBeNull();
  });

  it("a última interação é a mais recente entre conversa, nota, e-mail, abertura, clique, resposta e tarefa", () => {
    const s = montarSinais(
      bruto({
        contact: {
          name: "Ana",
          contact_notes: [{ created_at: antes(6) }],
          conversations: [{ last_message_at: antes(9), last_message_text: "oi" }],
        },
        enrollments: [
          {
            aberturas: 1,
            quente_em: null,
            ultimo_email_em: antes(8),
            ultima_abertura_em: antes(3),
            ultimo_clique_em: null,
            respondeu_em: null,
            email_cadences: null,
          },
        ],
        tarefas: [{ status: "concluida", concluida_em: antes(5) }],
      }),
      AGORA,
    );
    expect(s.diasSemContato).toBe(3);
  });

  it("negativo nunca acontece: data futura vira 0 dia", () => {
    const futuro = new Date(2026, 9, 9).toISOString();
    expect(montarSinais(bruto({ updated_at: futuro }), AGORA).diasSemAtualizar).toBe(0);
  });

  it("aberturas: maior contagem entre as inscrições, com o limite da cadência dela", () => {
    const insc = (aberturas: number, limiar: number | undefined, quente: string | null) => ({
      aberturas,
      quente_em: quente,
      ultimo_email_em: null,
      ultima_abertura_em: null,
      ultimo_clique_em: null,
      respondeu_em: null,
      email_cadences: { configuracao: limiar === undefined ? {} : { limiarLeadQuente: limiar } },
    });
    const s = montarSinais(bruto({ enrollments: [insc(1, 5, null), insc(4, 3, antes(1))] }), AGORA);
    expect(s).toMatchObject({ aberturas: 4, limiarDeAberturas: 3, leadQuente: true });
    const padrao = montarSinais(bruto({ enrollments: [insc(1, undefined, null)] }), AGORA);
    expect(padrao).toMatchObject({ aberturas: 1, limiarDeAberturas: 2, leadQuente: false });
  });

  it("resposta sem ação: nada nosso depois da resposta; qualquer ação depois desfaz", () => {
    const insc = (resp: string | null, email: string | null) => ({
      aberturas: 0,
      quente_em: null,
      ultimo_email_em: email,
      ultima_abertura_em: null,
      ultimo_clique_em: null,
      respondeu_em: resp,
      email_cadences: null,
    });
    expect(montarSinais(bruto({ enrollments: [insc(antes(3), antes(5))] }), AGORA).diasRespostaSemAcao).toBe(3);
    expect(montarSinais(bruto({ enrollments: [insc(null, antes(5))] }), AGORA).diasRespostaSemAcao).toBeNull();
    // uma nota depois da resposta conta como ação
    const comNota = bruto({
      enrollments: [insc(antes(3), antes(5))],
      contact: { name: "Ana", contact_notes: [{ created_at: antes(1) }], conversations: [] },
    });
    expect(montarSinais(comNota, AGORA).diasRespostaSemAcao).toBeNull();
    // uma tarefa concluída antes da resposta não conta
    const antiga = bruto({ enrollments: [insc(antes(3), antes(5))], tarefas: [{ status: "concluida", concluida_em: antes(4) }] });
    expect(montarSinais(antiga, AGORA).diasRespostaSemAcao).toBe(3);
  });

  it("previsão de fechamento em dias de calendário (data pura, sem deslocar o fuso)", () => {
    expect(montarSinais(bruto({ expected_close_date: "2026-10-09" }), AGORA).diasParaFechar).toBe(3);
    expect(montarSinais(bruto({ expected_close_date: "2026-10-06" }), AGORA).diasParaFechar).toBe(0);
    expect(montarSinais(bruto({ expected_close_date: "2026-10-01" }), AGORA).diasParaFechar).toBe(-5);
    expect(montarSinais(bruto({ expected_close_date: null }), AGORA).diasParaFechar).toBeNull();
    expect(montarSinais(bruto({ expected_close_date: "lixo" }), AGORA).diasParaFechar).toBeNull();
  });

  it("tarefa pendente, temperatura e texto disponível", () => {
    expect(montarSinais(bruto({ tarefas: [{ status: "concluida", concluida_em: antes(1) }] }), AGORA).temTarefaPendente).toBe(false);
    expect(montarSinais(bruto({ tarefas: [{ status: "pendente", concluida_em: null }] }), AGORA).temTarefaPendente).toBe(true);
    expect(montarSinais(bruto({ temperature: "quente" }), AGORA).temperatura).toBe("quente");
    expect(montarSinais(bruto({ temperature: "outra" }), AGORA).temperatura).toBeNull();
    expect(montarSinais(bruto(), AGORA).temTextoParaIa).toBe(false);
    expect(montarSinais(bruto({ notes: "  quer proposta " }), AGORA).temTextoParaIa).toBe(true);
    expect(montarSinais(bruto({ contact: { name: "Ana", contact_notes: [], conversations: [{ last_message_at: antes(1), last_message_text: "olá" }] } }), AGORA).temTextoParaIa).toBe(true);
  });

  it("valor inválido vira 0 e moeda vazia fica nula", () => {
    const s = montarSinais(bruto({ value: null, currency: "" }), AGORA);
    expect(s.valor).toBe(0);
    expect(s.moeda).toBeNull();
  });
});

describe("ocultarContatos", () => {
  it("troca e-mail e telefone por marcadores, em qualquer formato", () => {
    expect(ocultarContatos("fale com joao.silva+crm@empresa.com.br hoje")).toBe("fale com [e-mail] hoje");
    expect(ocultarContatos("ligar (11) 99999-8888")).toBe("ligar [telefone]");
    expect(ocultarContatos("whats +55 11 99999-8888 ok")).toBe("whats [telefone] ok");
    expect(ocultarContatos("fixo 3333-4444")).toBe("fixo [telefone]");
    expect(ocultarContatos("11999998888")).toBe("[telefone]");
  });

  it("não estraga valores em dinheiro, datas nem quantidades", () => {
    const t = "orçamento de R$ 1.250.000,00 em 10/10/2026, 12 usuários, CNPJ 12.345.678/0001-90";
    expect(ocultarContatos(t)).toBe(t);
    expect(ocultarContatos("R$ 42.000")).toBe("R$ 42.000");
  });
});

describe("montarEstado", () => {
  const base = () => resumirNegocio(bruto({ notes: "obs" }), AGORA);

  it("não leva e-mail nem telefone, nem o nome do contato", () => {
    const { estado } = montarEstado({
      negocio: base(),
      previsaoDeFechamento: "2026-10-30",
      observacoes: "ligar para 11 98888-7777",
      notas: [{ created_at: antes(1), note_text: "mandou e-mail de ana@topflex.com pedindo preço" }],
      mensagens: [{ created_at: antes(0), content_text: "me chama no (11) 97777-6666" }],
    });
    const texto = JSON.stringify(estado);
    expect(texto).not.toMatch(/@topflex|98888|97777/);
    expect(texto).not.toContain("Ana");
    expect(estado.negocio).toMatchObject({ titulo: "Top Flex", empresa: "Top Flex Ltda", etapa: "Proposta", valor: 42000, dias_na_etapa: 4 });
    expect(estado.notas[0]).toEqual({ data: antes(1).slice(0, 10), texto: "mandou e-mail de [e-mail] pedindo preço" });
  });

  it("sem notas, observação nem mensagem do cliente não há o que julgar", () => {
    const s = resumirNegocio(bruto(), AGORA);
    const r = montarEstado({ negocio: s, previsaoDeFechamento: null, observacoes: "  ", notas: [], mensagens: [{ created_at: antes(1), content_text: null }] });
    expect(r.temTexto).toBe(false);
    expect(r.estado.negocio.observacoes).toBe("");
  });

  it("limita a quantidade e o tamanho do texto enviado", () => {
    const longa = "palavra ".repeat(300);
    const r = montarEstado({
      negocio: base(),
      previsaoDeFechamento: null,
      observacoes: longa,
      notas: Array.from({ length: 10 }, (_, i) => ({ created_at: antes(i), note_text: longa })),
      mensagens: Array.from({ length: 8 }, (_, i) => ({ created_at: antes(i), content_text: longa })),
    });
    expect(r.estado.negocio.observacoes.length).toBeLessThanOrEqual(600);
    expect(r.estado.notas.length).toBeLessThanOrEqual(5);
    expect(r.estado.notas.reduce((t, n) => t + n.texto.length, 0)).toBeLessThanOrEqual(1000);
    expect(r.estado.mensagens_do_cliente).toHaveLength(3);
    for (const m of r.estado.mensagens_do_cliente) expect(m.texto.length).toBeLessThanOrEqual(300);
    expect(r.temTexto).toBe(true);
  });
});

describe("perguntas do serviço de decisão", () => {
  it("cada Score tem de 2 a 10 níveis, todos descritos, e nenhum deles é só um grau", () => {
    for (const c of CRITERIOS_DE_IA) {
      const niveis = PERGUNTAS_DE_SCORE[c].niveis;
      expect(niveis.length).toBeGreaterThanOrEqual(2);
      expect(niveis.length).toBeLessThanOrEqual(10);
      for (const n of niveis) {
        expect(n.descricao.length).toBeGreaterThan(30);
        expect(n.descricao).not.toMatch(/^(baixo|médio|alto)\b/i);
      }
    }
  });

  it("monta o corpo no formato do serviço (score com lista ordenada, choice com mapa até 255 caracteres)", () => {
    const p = montarPerguntas(["intencao_de_compra", "risco_de_perda"], true);
    expect(Object.keys(p)).toEqual(["intencao_de_compra", "risco_de_perda", "proxima_acao"]);
    const intencao = p.intencao_de_compra;
    expect(intencao.type).toBe("score");
    expect(Array.isArray(intencao.criteria)).toBe(true);
    expect((intencao.criteria as string[]).length).toBe(4);
    const acao = p.proxima_acao;
    expect(acao.type).toBe("choice");
    expect(Object.keys(acao.criteria)).toEqual([...ACOES]);
    for (const d of Object.values(acao.criteria as Record<string, string>)) expect(d.length).toBeLessThanOrEqual(255);
  });

  it("só pergunta o que foi pedido", () => {
    expect(Object.keys(montarPerguntas([], false))).toEqual([]);
    expect(Object.keys(montarPerguntas(["urgencia_do_cliente"], false))).toEqual(["urgencia_do_cliente"]);
  });

  it("nota = nível ÷ (níveis − 1) e rótulo do nível", () => {
    expect(ultimoNivel("intencao_de_compra")).toBe(3);
    expect([0, 1, 2, 3].map((n) => notaDoNivel("intencao_de_compra", n))).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(notaDoNivel("intencao_de_compra", 9)).toBe(1);
    expect(rotuloDoNivel("intencao_de_compra", 3)).toBe("pronto para fechar");
    expect(rotuloDoNivel("intencao_de_compra", 7)).toBe("");
  });
});
