import { describe, expect, it } from "vitest";
import { alternarCriterio, CRITERIOS, EQUILIBRADO, type Criterio } from "./criterios";
import { CONFIG_PADRAO, configSchema, normalizarConfig, type ConfigAnalisarDeals } from "./config";
import { calcularPrioridades, faixaDoScore, type RespostaDaIa } from "./prioridade";
import type { SinaisDoNegocio } from "./sinais";

const negocio = (extra: Partial<SinaisDoNegocio> = {}): SinaisDoNegocio => ({
  id: "d1",
  titulo: "Negócio",
  empresa: null,
  contato: null,
  etapaId: "e1",
  etapa: "Proposta",
  responsavelId: null,
  valor: 1000,
  moeda: "BRL",
  diasNaEtapa: 0,
  diasSemAtualizar: 0,
  diasSemContato: 0,
  aberturas: 0,
  leadQuente: false,
  limiarDeAberturas: 2,
  diasRespostaSemAcao: null,
  diasParaFechar: null,
  temperatura: null,
  temTarefaPendente: true,
  temTextoParaIa: true,
  ...extra,
});

const cfg = (extra: Partial<ConfigAnalisarDeals> = {}): ConfigAnalisarDeals => ({ ...CONFIG_PADRAO, ...extra });
const unico = (c: Criterio, s: Partial<SinaisDoNegocio>, config = cfg()) =>
  calcularPrioridades([negocio(s)], [c], config)[0];

describe("faixas", () => {
  it("> 80 crítica, 60–80 alta, 40–60 média, < 40 baixa", () => {
    expect([100, 81, 80, 60, 59, 40, 39, 0].map(faixaDoScore)).toEqual([
      "critica",
      "critica",
      "alta",
      "alta",
      "media",
      "media",
      "baixa",
      "baixa",
    ]);
  });
});

describe("critérios por regra", () => {
  it("sem contato: dias ÷ limite, com teto em 100 e sem contato nenhum = máximo", () => {
    expect(unico("sem_contato", { diasSemContato: 0 }).score).toBe(0);
    expect(unico("sem_contato", { diasSemContato: 7 }, cfg({ diasSemContato: 14 })).score).toBe(50);
    expect(unico("sem_contato", { diasSemContato: 40 }).score).toBe(100);
    const nunca = unico("sem_contato", { diasSemContato: null });
    expect(nunca.score).toBe(100);
    expect(nunca.motivos[0]).toBe("Nenhum contato registrado");
  });

  it("respeita o limite configurado", () => {
    expect(unico("sem_atualizacao", { diasSemAtualizar: 7 }, cfg({ diasSemAtualizacao: 7 })).score).toBe(100);
    expect(unico("parado_na_etapa", { diasNaEtapa: 7 }, cfg({ diasParadoNaEtapa: 28 })).score).toBe(25);
  });

  it("aberturas: lead quente = máximo; senão aberturas ÷ limite da cadência", () => {
    expect(unico("aberturas", { aberturas: 1, limiarDeAberturas: 2 }).score).toBe(50);
    expect(unico("aberturas", { aberturas: 2, leadQuente: true }).score).toBe(100);
    expect(unico("aberturas", { aberturas: 0 }).score).toBe(0);
    expect(unico("aberturas", { aberturas: 3, leadQuente: true }).motivos[0]).toBe("Lead quente: abriu o e-mail 3x");
  });

  it("resposta sem ação pesa forte e cresce com os dias", () => {
    expect(unico("resposta_sem_acao", { diasRespostaSemAcao: null }).score).toBe(0);
    expect(unico("resposta_sem_acao", { diasRespostaSemAcao: 0 }).score).toBe(60);
    expect(unico("resposta_sem_acao", { diasRespostaSemAcao: 7 }).score).toBe(100);
  });

  it("fechamento próximo: vencido e hoje = máximo; fora da janela = 0; entre os dois cai", () => {
    expect(unico("fechamento_proximo", { diasParaFechar: -3 }).motivos[0]).toBe("Previsão de fechamento venceu há 3 dias");
    expect([-3, 0].map((d) => unico("fechamento_proximo", { diasParaFechar: d }).score)).toEqual([100, 100]);
    expect(unico("fechamento_proximo", { diasParaFechar: 8 }).score).toBe(0);
    expect(unico("fechamento_proximo", { diasParaFechar: null }).score).toBe(0);
    const perto = unico("fechamento_proximo", { diasParaFechar: 2 }).score;
    const longe = unico("fechamento_proximo", { diasParaFechar: 6 }).score;
    expect(perto).toBeGreaterThan(longe);
    expect(longe).toBeGreaterThan(0);
  });

  it("sem próxima tarefa e temperatura", () => {
    expect(unico("sem_proxima_tarefa", { temTarefaPendente: false }).score).toBe(100);
    expect(unico("sem_proxima_tarefa", { temTarefaPendente: true }).score).toBe(0);
    expect(unico("temperatura", { temperatura: "quase_fechando" }).score).toBe(100);
    expect(unico("temperatura", { temperatura: "sem_interesse" }).score).toBe(0);
    expect(unico("temperatura", { temperatura: null }).score).toBe(0);
  });

  it("maior e menor valor comparam com os outros analisados e se espelham", () => {
    const lista = [negocio({ id: "a", valor: 100 }), negocio({ id: "b", valor: 5000 }), negocio({ id: "c", valor: 800 })];
    const maior = calcularPrioridades(lista, ["maior_valor"], cfg());
    expect(maior.map((i) => i.id)).toEqual(["b", "c", "a"]);
    const menor = calcularPrioridades(lista, ["menor_valor"], cfg());
    expect(menor.map((i) => i.id)).toEqual(["a", "c", "b"]);
    const soma = (id: string) => maior.find((i) => i.id === id)!.score + menor.find((i) => i.id === id)!.score;
    expect(["a", "b", "c"].map(soma)).toEqual([100, 100, 100]);
  });

  it("um outlier de valor não achata os demais (posição, não proporção)", () => {
    const lista = [
      negocio({ id: "a", valor: 1000 }),
      negocio({ id: "b", valor: 2000 }),
      negocio({ id: "c", valor: 9_000_000 }),
    ];
    const r = calcularPrioridades(lista, ["maior_valor"], cfg());
    expect(r.find((i) => i.id === "b")!.score).toBeGreaterThanOrEqual(40);
  });

  it("um negócio só: valor não discrimina (meio da escala)", () => {
    expect(unico("maior_valor", { valor: 42_000 }).score).toBe(50);
  });
});

describe("score final", () => {
  it("é a média ponderada dos critérios escolhidos, pelos pesos configurados", () => {
    const s = negocio({ diasSemContato: 14, diasSemAtualizar: 0 }); // contato 100%, atualização 0%
    const pesos = { ...CONFIG_PADRAO.pesos, sem_contato: 3, sem_atualizacao: 1 };
    const r = calcularPrioridades([s], ["sem_contato", "sem_atualizacao"], cfg({ pesos }))[0];
    expect(r.score).toBe(75);
    const igual = { ...pesos, sem_contato: 1, sem_atualizacao: 1 };
    expect(calcularPrioridades([s], ["sem_contato", "sem_atualizacao"], cfg({ pesos: igual }))[0].score).toBe(50);
  });

  it("só os critérios escolhidos pesam", () => {
    const s = negocio({ diasSemContato: 14, temTarefaPendente: false });
    expect(calcularPrioridades([s], ["sem_contato"], cfg())[0].score).toBe(100);
    expect(calcularPrioridades([s], ["sem_contato", "sem_atualizacao"], cfg())[0].score).toBeLessThan(100);
  });

  it("peso zero ignora o critério e nada escolhido dá zero", () => {
    const pesos = { ...CONFIG_PADRAO.pesos, sem_atualizacao: 0 };
    const s = negocio({ diasSemContato: 14, diasSemAtualizar: 0 });
    expect(calcularPrioridades([s], ["sem_contato", "sem_atualizacao"], cfg({ pesos }))[0].score).toBe(100);
    expect(calcularPrioridades([s], [], cfg())[0].score).toBe(0);
  });

  it("caso fechado: negócio de valor alto, quente, abandonado e vencido → crítico; o em dia fica baixo", () => {
    const abandonado = negocio({
      id: "abandonado",
      valor: 42_000,
      diasNaEtapa: 14,
      diasSemAtualizar: 14,
      diasSemContato: 9,
      leadQuente: true,
      aberturas: 3,
      diasRespostaSemAcao: 7,
      temTarefaPendente: false,
      diasParaFechar: -1,
      temperatura: "quente",
    });
    const emDia = negocio({ id: "em-dia", valor: 500, temperatura: "frio" });
    const barato = negocio({ id: "barato", valor: 800, temperatura: "frio" });
    const r = calcularPrioridades([emDia, abandonado, barato], EQUILIBRADO, cfg());
    expect(r[0]).toMatchObject({ id: "abandonado", faixa: "critica" });
    expect(r[0].motivos).toHaveLength(3);
    expect(r.filter((i) => i.id !== "abandonado").every((i) => i.faixa === "baixa")).toBe(true);
  });

  it("um negócio com poucos sinais ativos no 'Equilibrado' não passa de alta (a média dilui)", () => {
    const s = negocio({ valor: 42_000, diasNaEtapa: 4, diasSemContato: 9, leadQuente: true, aberturas: 3, diasRespostaSemAcao: 4, temTarefaPendente: false, diasParaFechar: 2, temperatura: "quente" });
    expect(calcularPrioridades([s], EQUILIBRADO, cfg())[0].faixa).toBe("alta");
  });

  it("ordena do maior para o menor score; empate vai para o maior valor", () => {
    const lista = [
      negocio({ id: "frio", diasSemContato: 0 }),
      negocio({ id: "parado-barato", diasSemContato: 20, valor: 10 }),
      negocio({ id: "parado-caro", diasSemContato: 20, valor: 9000 }),
    ];
    expect(calcularPrioridades(lista, ["sem_contato"], cfg()).map((i) => i.id)).toEqual(["parado-caro", "parado-barato", "frio"]);
  });

  it("mostra só motivos relevantes, no máximo 3, do que mais pesou", () => {
    const s = negocio({ diasSemContato: 30, diasSemAtualizar: 30, diasNaEtapa: 30, temTarefaPendente: false });
    const r = calcularPrioridades([s], ["sem_contato", "sem_atualizacao", "parado_na_etapa", "sem_proxima_tarefa"], cfg())[0];
    expect(r.motivos).toHaveLength(3);
    expect(r.motivos[0]).toBe("30 dias sem contato"); // maior peso
  });

  it("sem nenhum sinal forte, avisa em vez de listar motivo vazio", () => {
    expect(unico("sem_contato", { diasSemContato: 0 }).motivos).toEqual(["Sem sinais fortes entre os critérios escolhidos"]);
  });
});

describe("critérios da IA", () => {
  const resposta = (extra: Partial<RespostaDaIa> = {}): RespostaDaIa => ({ scores: {}, estimado: false, ...extra });

  it("normaliza o nível por (níveis − 1) e mostra o rótulo e a confiança", () => {
    const r = calcularPrioridades(
      [negocio()],
      ["intencao_de_compra"],
      cfg(),
      { d1: resposta({ scores: { intencao_de_compra: { nivel: 2, confianca: 0.86 } } }) },
    )[0];
    expect(r.score).toBe(67); // 2 ÷ 3
    expect(r.motivos[0]).toBe("Intenção de compra: interesse claro (confiança 0,86)");
    expect(r.iaIncerta).toBe(false);
  });

  it("confiança abaixo do mínimo ignora a resposta e marca IA incerta", () => {
    const r = calcularPrioridades(
      [negocio({ diasSemContato: 14 })],
      ["sem_contato", "intencao_de_compra"],
      cfg(),
      { d1: resposta({ scores: { intencao_de_compra: { nivel: 3, confianca: 0.1 } } }) },
    )[0];
    expect(r.iaIncerta).toBe(true);
    expect(r.score).toBe(100); // só a regra entrou na média
    expect(r.motivos.some((m) => m.startsWith("Intenção"))).toBe(false);
    // mudando o mínimo, a mesma resposta passa
    const aceita = calcularPrioridades(
      [negocio({ diasSemContato: 14 })],
      ["sem_contato", "intencao_de_compra"],
      cfg({ confiancaMinima: 0.05 }),
      { d1: resposta({ scores: { intencao_de_compra: { nivel: 3, confianca: 0.1 } } }) },
    )[0];
    expect(aceita.iaIncerta).toBe(false);
  });

  it("negócio não julgado fica só com as regras e avisa 'sem dados'", () => {
    const r = calcularPrioridades([negocio({ diasSemContato: 14 })], ["sem_contato", "risco_de_perda"], cfg())[0];
    expect(r.iaSemDados).toBe(true);
    expect(r.score).toBe(100);
    const soIa = calcularPrioridades([negocio()], ["risco_de_perda"], cfg())[0];
    expect(soIa.score).toBe(0);
    expect(soIa.iaSemDados).toBe(true);
  });

  it("resposta estimada (modo reduzido) entra e é marcada", () => {
    const r = calcularPrioridades(
      [negocio()],
      ["urgencia_do_cliente"],
      cfg(),
      { d1: resposta({ estimado: true, scores: { urgencia_do_cliente: { nivel: 3, confianca: null } } }) },
    )[0];
    expect(r.score).toBe(100);
    expect(r.estimado).toBe(true);
    expect(r.motivos[0]).toBe("Urgência do cliente: urgente (estimado)");
  });

  it("ação: a da IA quando confiante; senão a do critério de regra dominante", () => {
    const base = negocio({ diasSemContato: 20 });
    const comIa = calcularPrioridades([base], ["sem_contato"], cfg(), {
      d1: resposta({ acao: { opcao: "enviar_proposta", confianca: 0.9 } }),
    })[0];
    expect(comIa.acao).toBe("Enviar ou revisar a proposta");
    expect(comIa.acaoDaIa).toBe(true);
    const incerta = calcularPrioridades([base], ["sem_contato"], cfg(), {
      d1: resposta({ acao: { opcao: "enviar_proposta", confianca: 0.1 } }),
    })[0];
    expect(incerta.acao).toBe("Fazer contato hoje");
    expect(incerta.acaoDaIa).toBe(false);
    const semNada = calcularPrioridades([negocio()], ["sem_contato"], cfg())[0];
    expect(semNada.acao).toBe("Revisar o negócio");
  });
});

describe("critérios e configuração", () => {
  it("maior e menor valor se excluem; os outros convivem", () => {
    expect(alternarCriterio(["maior_valor", "sem_contato"], "menor_valor")).toEqual(["sem_contato", "menor_valor"]);
    expect(alternarCriterio(["menor_valor"], "menor_valor")).toEqual([]);
    expect(alternarCriterio(["sem_contato"], "aberturas")).toEqual(["sem_contato", "aberturas"]);
  });

  it("'Equilibrado' usa as regras e deixa a IA e 'menor valor' de fora", () => {
    expect(EQUILIBRADO).toContain("maior_valor");
    expect(EQUILIBRADO).not.toContain("menor_valor");
    expect(EQUILIBRADO.some((c) => ["intencao_de_compra", "urgencia_do_cliente", "risco_de_perda"].includes(c))).toBe(false);
  });

  it("configuração ausente ou torta cai no padrão, e valores fora do limite são cortados", () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_PADRAO);
    expect(normalizarConfig("lixo")).toEqual(CONFIG_PADRAO);
    const c = normalizarConfig({ pesos: { sem_contato: 99, maior_valor: "x" }, diasSemContato: 0, confiancaMinima: 5 });
    expect(c.pesos.sem_contato).toBe(10);
    expect(c.pesos.maior_valor).toBe(CONFIG_PADRAO.pesos.maior_valor);
    expect(c.diasSemContato).toBe(1);
    expect(c.confiancaMinima).toBe(1);
    expect(Object.keys(c.pesos).sort()).toEqual([...CRITERIOS].sort());
  });

  it("o schema de gravação exige a configuração inteira e recusa o que está fora dos limites", () => {
    expect(configSchema.safeParse(CONFIG_PADRAO).success).toBe(true);
    expect(configSchema.safeParse({ ...CONFIG_PADRAO, diasSemContato: 0 }).success).toBe(false);
    expect(configSchema.safeParse({ ...CONFIG_PADRAO, confiancaMinima: 1.5 }).success).toBe(false);
    expect(configSchema.safeParse({ ...CONFIG_PADRAO, pesos: { ...CONFIG_PADRAO.pesos, sem_contato: 11 } }).success).toBe(false);
    expect(configSchema.safeParse({ ...CONFIG_PADRAO, extra: 1 }).success).toBe(false);
    const { diasSemContato: _ignorado, ...incompleta } = CONFIG_PADRAO;
    void _ignorado;
    expect(configSchema.safeParse(incompleta).success).toBe(false);
  });
});
