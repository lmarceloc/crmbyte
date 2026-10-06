import { describe, expect, it, vi } from "vitest";
import { montarPerguntas } from "@/lib/pipeline/perguntas";
import type { EstadoParaIa } from "@/lib/pipeline/sinais";
import {
  ErroDoServico,
  lerRespostas,
  MODELO_DO_SERVICO,
  perguntar,
  perguntarComRetentativa,
  URL_DO_SERVICO,
} from "./analisar-deals";
import { mapComLimite } from "./concorrencia";
import { julgarEmLote, lerLote, MAX_NO_MODO_REDUZIDO, montarMensagens } from "./analisar-deals-reduzido";
import { IaError } from "./erro";
import { URL_OPENROUTER } from "./openrouter";

const CHAVE = "chave-secreta-de-teste-1234567890";
const estado = { negocio: { titulo: "Top Flex" }, notas: [], mensagens_do_cliente: [] } as unknown as EstadoParaIa;
const perguntas = montarPerguntas(["intencao_de_compra", "risco_de_perda"], true);

/** Resposta no formato da documentação: answers.<id> com type, score|choice, confidence, probabilities. */
const corpoDoServico = {
  model: "jev-latest",
  answers: {
    intencao_de_compra: {
      type: "score",
      score: 2,
      confidence: 0.86,
      legend: "Interesse claro com dúvidas",
      probabilities: [0.02, 0.05, 0.86, 0.07],
    },
    risco_de_perda: { type: "score", score: 0, confidence: 0.41, legend: "Sem risco aparente", probabilities: [0.41, 0.3, 0.2, 0.09] },
    proxima_acao: { type: "choice", choice: "enviar_proposta", confidence: 0.77, probabilities: { enviar_proposta: 0.77 } },
  },
  usage: { input_tokens: 812, output_tokens: 31 },
};

const resposta = (corpo: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("perguntar", () => {
  it("envia o pedido no formato do serviço: URL fixa, Bearer, model, state e questions", async () => {
    const fetchFn = vi.fn(async () => resposta(corpoDoServico));
    await perguntar(CHAVE, estado, perguntas, { fetchFn: fetchFn as unknown as typeof fetch });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_DO_SERVICO);
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const cab = init.headers as Record<string, string>;
    expect(cab.Authorization).toBe(`Bearer ${CHAVE}`);
    expect(cab["Content-Type"]).toBe("application/json");
    const corpo = JSON.parse(init.body as string);
    expect(corpo.model).toBe(MODELO_DO_SERVICO);
    expect(corpo.model).toBe("jev-latest");
    expect(corpo.state).toEqual(estado);
    expect(Object.keys(corpo.questions)).toEqual(["intencao_de_compra", "risco_de_perda", "proxima_acao"]);
    expect(corpo.questions.intencao_de_compra).toMatchObject({ type: "score" });
    expect(corpo.questions.intencao_de_compra.criteria).toHaveLength(4);
    expect(corpo.questions.proxima_acao).toMatchObject({ type: "choice" });
    expect(Object.keys(corpo.questions.proxima_acao.criteria)).toContain("follow_up_hoje");
    // a chave só vai no cabeçalho
    expect(init.body as string).not.toContain(CHAVE);
  });

  it("lê score, choice, confiança e uso", async () => {
    const r = await perguntar(CHAVE, estado, perguntas, {
      fetchFn: (async () => resposta(corpoDoServico)) as unknown as typeof fetch,
    });
    expect(r.resposta).toEqual({
      scores: {
        intencao_de_compra: { nivel: 2, confianca: 0.86 },
        risco_de_perda: { nivel: 0, confianca: 0.41 },
      },
      acao: { opcao: "enviar_proposta", confianca: 0.77 },
      estimado: false,
    });
    expect(r.uso).toEqual({ entrada: 812, saida: 31 });
  });

  it("chave recusada: mensagem pronta, sem tentar de novo e sem vazar a chave", async () => {
    const fetchFn = vi.fn(async () => resposta({ error: { message: `invalid key ${CHAVE}` } }, { status: 401 }));
    const erro = await perguntarComRetentativa(CHAVE, estado, perguntas, {
      fetchFn: fetchFn as unknown as typeof fetch,
      dormir: async () => {},
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoServico);
    expect(erro).toBeInstanceOf(IaError);
    expect(erro.code).toBe("analisar_deals_key");
    expect(erro.message).toContain("Configurações → Chaves de API");
    expect(erro.message).not.toContain(CHAVE);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("erro do servidor mostra o status e esconde a chave se o serviço a repetir", async () => {
    const fetchFn = vi.fn(async () => resposta({ error: `falhou com ${CHAVE}` }, { status: 400 }));
    const erro = await perguntar(CHAVE, estado, perguntas, { fetchFn: fetchFn as unknown as typeof fetch }).catch((e) => e);
    expect(erro.code).toBe("analisar_deals_failed");
    expect(erro.message).toContain("HTTP 400");
    expect(erro.message).toContain("***");
    expect(erro.message).not.toContain(CHAVE);
    expect(erro.tentarDeNovo).toBe(false);
  });

  it("falha de rede e tempo esgotado viram erro com mensagem clara", async () => {
    const rede = await perguntar(CHAVE, estado, perguntas, {
      fetchFn: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    }).catch((e) => e);
    expect(rede).toMatchObject({ code: "analisar_deals_unreachable", status: 504, tentarDeNovo: true });
    const demora = await perguntar(CHAVE, estado, perguntas, {
      fetchFn: (async () => {
        throw Object.assign(new Error("t"), { name: "TimeoutError" });
      }) as unknown as typeof fetch,
    }).catch((e) => e);
    expect(demora.message).toContain("demorou demais");
  });
});

describe("perguntarComRetentativa", () => {
  it("429 espera e tenta de novo até dar certo", async () => {
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});
    let n = 0;
    const fetchFn = vi.fn(async () => (++n < 3 ? resposta({}, { status: 429, headers: { "retry-after": "2" } }) : resposta(corpoDoServico)));
    const r = await perguntarComRetentativa(CHAVE, estado, perguntas, { fetchFn: fetchFn as unknown as typeof fetch, dormir });
    expect(r.resposta.scores.intencao_de_compra?.nivel).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(dormir).toHaveBeenNthCalledWith(1, 2000); // respeita o Retry-After
  });

  it("5xx tenta de novo com espera crescente e desiste na terceira", async () => {
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchFn = vi.fn(async () => resposta({ error: "boom" }, { status: 503 }));
    const erro = await perguntarComRetentativa(CHAVE, estado, perguntas, { fetchFn: fetchFn as unknown as typeof fetch, dormir }).catch((e) => e);
    expect(erro.code).toBe("analisar_deals_failed");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([500, 1500]);
  });

  it("perto do prazo não espera para tentar de novo: devolve o erro que já tem", async () => {
    const relogio = 1_000_000;
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchFn = vi.fn(async () => resposta({ error: "boom" }, { status: 503 }));
    const erro = await perguntarComRetentativa(CHAVE, estado, perguntas, {
      fetchFn: fetchFn as unknown as typeof fetch,
      dormir,
      agora: () => relogio,
      prazoFinalMs: relogio + 1_200, // só sobra 1,2 s: a espera de 0,5 s + folga de 1 s já estoura
    }).catch((e) => e);
    expect(erro.code).toBe("analisar_deals_failed");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(dormir).not.toHaveBeenCalled();
  });

  it("o tempo limite de cada chamada nunca passa do prazo (mínimo de 1 s)", async () => {
    const tempos: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => (tempos.push(ms), new AbortController().signal));
    const agora = () => 5_000_000;
    const ok = (async () => resposta(corpoDoServico)) as unknown as typeof fetch;
    await perguntar(CHAVE, estado, perguntas, { fetchFn: ok, agora, prazoFinalMs: agora() + 7_000 });
    await perguntar(CHAVE, estado, perguntas, { fetchFn: ok, agora, prazoFinalMs: agora() + 100 });
    await perguntar(CHAVE, estado, perguntas, { fetchFn: ok, agora });
    spy.mockRestore();
    expect(tempos).toEqual([7_000, 1_000, 20_000]);
  });

  it("limite de uso persistente vira erro 429 para a tela", async () => {
    const fetchFn = vi.fn(async () => resposta({}, { status: 429 }));
    const erro = await perguntarComRetentativa(CHAVE, estado, perguntas, { fetchFn: fetchFn as unknown as typeof fetch, dormir: async () => {} }).catch((e) => e);
    expect(erro).toMatchObject({ code: "analisar_deals_rate_limit", status: 429 });
  });
});

describe("lerRespostas", () => {
  it("descarta respostas fora do formato, sem derrubar as boas", () => {
    const r = lerRespostas(
      {
        answers: {
          intencao_de_compra: { type: "score", score: 9, confidence: 0.9 }, // fora da escala
          risco_de_perda: { type: "choice", choice: "x", confidence: 0.9 }, // tipo errado
          urgencia_do_cliente: { type: "score", score: 1, confidence: 7 }, // confiança impossível
          proxima_acao: { type: "choice", choice: "inventada", confidence: 0.9 }, // opção desconhecida
        },
      },
      montarPerguntas(["intencao_de_compra", "risco_de_perda", "urgencia_do_cliente"], true),
    );
    expect(r.scores).toEqual({});
    expect(r.acao).toBeUndefined();
  });

  it("ignora o que não foi perguntado e corpos sem answers", () => {
    expect(lerRespostas(corpoDoServico, montarPerguntas(["intencao_de_compra"], false))).toEqual({
      scores: { intencao_de_compra: { nivel: 2, confianca: 0.86 } },
      estimado: false,
    });
    expect(lerRespostas(null, perguntas).scores).toEqual({});
    expect(lerRespostas({ answers: "x" }, perguntas).scores).toEqual({});
  });

  it("aceita nível fracionário dentro da escala (valor esperado entre níveis)", () => {
    const r = lerRespostas(
      { answers: { intencao_de_compra: { type: "score", score: 1.6, confidence: 0.5 } } },
      montarPerguntas(["intencao_de_compra"], false),
    );
    expect(r.scores.intencao_de_compra).toEqual({ nivel: 1.6, confianca: 0.5 });
  });
});

describe("mapComLimite", () => {
  it("respeita o limite de chamadas ao mesmo tempo e mantém a ordem", async () => {
    let ativos = 0;
    let pico = 0;
    const r = await mapComLimite([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      ativos++;
      pico = Math.max(pico, ativos);
      await new Promise((ok) => setTimeout(ok, 5 * (8 - n)));
      ativos--;
      return n * 10;
    });
    expect(r).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(pico).toBe(3);
  });

  it("lista vazia não chama nada", async () => {
    const fn = vi.fn();
    expect(await mapComLimite([], 6, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("modo reduzido (OpenRouter)", () => {
  const itens = [{ estado }, { estado }, { estado }];

  it("monta o pedido com as escalas descritas e o formato de saída", () => {
    const [sistema, usuario] = montarMensagens(itens, ["intencao_de_compra"], true);
    expect(sistema.role).toBe("system");
    expect(sistema.content).toContain("SOMENTE com um array JSON");
    expect(sistema.content).toContain('"intencao_de_compra" (número inteiro de 0 a 3)');
    expect(sistema.content).toContain("3 = Pronto para fechar");
    expect(sistema.content).toContain("follow_up_hoje");
    expect(sistema.content).not.toContain("risco_de_perda");
    expect(JSON.parse(usuario.content.split("\n")[1]).map((x: { i: number }) => x.i)).toEqual([0, 1, 2]);
  });

  it("lê o array mesmo com cerca de markdown e frase antes", () => {
    const texto = 'Claro!\n```json\n[{"i":0,"intencao_de_compra":3,"proxima_acao":"enviar_proposta"},{"i":2,"intencao_de_compra":"1"}]\n```';
    const r = lerLote(texto, 3, ["intencao_de_compra"], true);
    expect(r[0]).toEqual({ scores: { intencao_de_compra: { nivel: 3, confianca: null } }, acao: { opcao: "enviar_proposta", confianca: null }, estimado: true });
    expect(r[1]).toBeNull();
    expect(r[2]?.scores.intencao_de_compra?.nivel).toBe(1);
  });

  it("descarta índice repetido ou fora do lote, nível fora da escala e ação inventada", () => {
    const texto = JSON.stringify([
      { i: 0, intencao_de_compra: 2 },
      { i: 0, intencao_de_compra: 0 }, // repetido: vale o primeiro
      { i: 7, intencao_de_compra: 2 }, // fora do lote
      { i: 1, intencao_de_compra: 9, proxima_acao: "inventada" }, // nada aproveitável
      { i: 2, intencao_de_compra: 1.5 }, // não inteiro
    ]);
    const r = lerLote(texto, 3, ["intencao_de_compra"], true);
    expect(r[0]?.scores.intencao_de_compra?.nivel).toBe(2);
    expect(r[1]).toBeNull();
    expect(r[2]).toBeNull();
  });

  it("texto sem JSON devolve tudo vazio", () => {
    expect(lerLote("não consegui", 2, ["intencao_de_compra"], false)).toEqual([null, null]);
    expect(lerLote("[quebrado", 2, ["intencao_de_compra"], false)).toEqual([null, null]);
  });

  it("chama o OpenRouter uma vez, com temperatura baixa, e devolve uma resposta por negócio", async () => {
    const fetchFn = vi.fn(async () =>
      resposta({ choices: [{ message: { content: '[{"i":0,"urgencia_do_cliente":2},{"i":1,"urgencia_do_cliente":0}]' } }] }),
    );
    const r = await julgarEmLote(CHAVE, itens.slice(0, 2), ["urgencia_do_cliente"], false, fetchFn as unknown as typeof fetch);
    expect(r.map((x) => x?.scores.urgencia_do_cliente?.nivel)).toEqual([2, 0]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_OPENROUTER);
    const corpo = JSON.parse(init.body as string);
    expect(corpo.model).toBe("openrouter/free");
    expect(corpo.temperature).toBe(0.2);
    expect(corpo.max_tokens).toBe(1200);
  });

  it(`recusa mais de ${MAX_NO_MODO_REDUZIDO} negócios por chamada`, async () => {
    const muitos = Array.from({ length: MAX_NO_MODO_REDUZIDO + 1 }, () => ({ estado }));
    const erro = await julgarEmLote(CHAVE, muitos, ["intencao_de_compra"], false, vi.fn() as unknown as typeof fetch).catch((e) => e);
    expect(erro).toMatchObject({ code: "analisar_deals_lote_grande", status: 422 });
  });
});
