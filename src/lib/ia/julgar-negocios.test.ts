import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoParaIa } from "@/lib/pipeline/sinais";
import { cacheNoBanco } from "./cache-analisar-deals";
import {
  chaveDoCache,
  hashDoEstado,
  julgarComServico,
  julgarReduzido,
  VALIDADE_DO_CACHE_MS,
  type CacheDeRespostas,
  type RespostaGuardada,
} from "./julgar-negocios";

const CHAVE = "chave-secreta-de-teste-1234567890";
const estadoDe = (titulo: string): EstadoParaIa => ({
  negocio: { titulo, empresa: null, etapa: "Proposta", valor: 1000, moeda: "BRL", dias_na_etapa: 3, dias_sem_atualizar: 3, previsao_de_fechamento: null, observacoes: "quer proposta" },
  notas: [],
  mensagens_do_cliente: [],
});
const negocios = ["a", "b", "c"].map((id) => ({ id, estado: estadoDe(`Negócio ${id}`) }));

const resposta = (corpo: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

/** Serviço falso: devolve um score por pergunta pedida, e conta as chamadas por negócio (título no state). */
function servicoFalso(nivel = 2, confidence = 0.8) {
  const chamadas: { titulo: string; perguntas: string[] }[] = [];
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
    const corpo = JSON.parse(init.body as string);
    chamadas.push({ titulo: corpo.state.negocio.titulo, perguntas: Object.keys(corpo.questions) });
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(corpo.questions as Record<string, { type: string }>)) {
      answers[id] = q.type === "score" ? { type: "score", score: nivel, confidence } : { type: "choice", choice: "follow_up_hoje", confidence };
    }
    return resposta({ model: "jev-latest", answers, usage: { input_tokens: 100, output_tokens: 10 } });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, chamadas };
}

function cacheEmMemoria(inicial: [string, string, RespostaGuardada][] = []) {
  const linhas = new Map<string, { hash: string; resposta: RespostaGuardada }>();
  for (const [deal, pergunta, resposta] of inicial) linhas.set(chaveDoCache(deal, pergunta), { hash: "", resposta });
  const cache: CacheDeRespostas & { linhas: typeof linhas } = {
    linhas,
    ler: vi.fn(async (hashes, perguntas) => {
      const r = new Map<string, RespostaGuardada>();
      for (const [dealId, hash] of hashes)
        for (const p of perguntas) {
          const l = linhas.get(chaveDoCache(dealId, p));
          if (l && (l.hash === hash || l.hash === "")) r.set(chaveDoCache(dealId, p), l.resposta);
        }
      return r;
    }),
    gravar: vi.fn(async (novas) => {
      for (const n of novas) linhas.set(chaveDoCache(n.dealId, n.pergunta), { hash: n.hash, resposta: n.resposta });
    }),
  };
  return cache;
}

const base = { chave: CHAVE, criterios: ["intencao_de_compra" as const, "risco_de_perda" as const], proximaAcao: true, dormir: async () => {} };

describe("julgarComServico", () => {
  it("uma chamada por negócio, com todas as perguntas, e guarda o que veio", async () => {
    const { fetchFn, chamadas } = servicoFalso();
    const cache = cacheEmMemoria();
    const r = await julgarComServico({ ...base, negocios, cache, fetchFn });

    expect(chamadas).toHaveLength(3);
    for (const c of chamadas) expect(c.perguntas).toEqual(["intencao_de_compra", "risco_de_perda", "proxima_acao"]);
    expect(Object.keys(r.respostas).sort()).toEqual(["a", "b", "c"]);
    expect(r.respostas.a).toEqual({
      scores: { intencao_de_compra: { nivel: 2, confianca: 0.8 }, risco_de_perda: { nivel: 2, confianca: 0.8 } },
      acao: { opcao: "follow_up_hoje", confianca: 0.8 },
      estimado: false,
    });
    expect(r.uso).toEqual({ entrada: 300, saida: 30 });
    expect(r.doCache).toBe(0);
    expect(r.limiteAtingido).toBe(false);
    expect(cache.linhas.size).toBe(9); // 3 negócios × 3 perguntas
  });

  it("segunda análise dos mesmos negócios não chama o serviço (cache por hash)", async () => {
    const { fetchFn, chamadas } = servicoFalso();
    const cache = cacheEmMemoria();
    await julgarComServico({ ...base, negocios, cache, fetchFn });
    chamadas.length = 0;
    const r = await julgarComServico({ ...base, negocios, cache, fetchFn });
    expect(chamadas).toHaveLength(0);
    expect(r.doCache).toBe(3);
    expect(Object.keys(r.respostas)).toHaveLength(3);
  });

  it("trocar os critérios só pergunta o que falta (as respostas guardadas são reaproveitadas)", async () => {
    const { fetchFn, chamadas } = servicoFalso();
    const cache = cacheEmMemoria();
    await julgarComServico({ ...base, criterios: ["intencao_de_compra"], proximaAcao: false, negocios: negocios.slice(0, 1), cache, fetchFn });
    chamadas.length = 0;
    const r = await julgarComServico({ ...base, criterios: ["intencao_de_compra", "urgencia_do_cliente"], proximaAcao: false, negocios: negocios.slice(0, 1), cache, fetchFn });
    expect(chamadas).toEqual([{ titulo: "Negócio a", perguntas: ["urgencia_do_cliente"] }]);
    expect(Object.keys(r.respostas.a.scores).sort()).toEqual(["intencao_de_compra", "urgencia_do_cliente"]);
  });

  it("negócio que mudou (hash diferente) é julgado de novo", async () => {
    const { fetchFn, chamadas } = servicoFalso();
    const cache = cacheEmMemoria();
    await julgarComServico({ ...base, negocios: negocios.slice(0, 1), cache, fetchFn });
    chamadas.length = 0;
    const mudou = [{ id: "a", estado: { ...estadoDe("Negócio a"), notas: [{ data: "2026-10-06", texto: "pediu desconto" }] } }];
    await julgarComServico({ ...base, negocios: mudou, cache, fetchFn });
    expect(chamadas).toHaveLength(1);
    expect(hashDoEstado(mudou[0].estado, "servico")).not.toBe(hashDoEstado(negocios[0].estado, "servico"));
    expect(hashDoEstado(negocios[0].estado, "servico")).not.toBe(hashDoEstado(negocios[0].estado, "reduzido"));
  });

  it("respeita a concorrência máxima", async () => {
    let ativos = 0;
    let pico = 0;
    const fetchFn = vi.fn(async () => {
      ativos++;
      pico = Math.max(pico, ativos);
      await new Promise((ok) => setTimeout(ok, 5));
      ativos--;
      return resposta({ answers: {} });
    });
    const muitos = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, estado: estadoDe(`N${i}`) }));
    await julgarComServico({ ...base, negocios: muitos, cache: cacheEmMemoria(), fetchFn: fetchFn as unknown as typeof fetch, simultaneas: 4 });
    expect(pico).toBe(4);
    expect(fetchFn).toHaveBeenCalledTimes(12);
  });

  it("falha de um negócio não derruba os outros: vira falha e segue", async () => {
    let n = 0;
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const titulo = JSON.parse(init.body as string).state.negocio.titulo;
      n++;
      if (titulo === "Negócio b") return resposta({ error: "quebrou" }, { status: 400 });
      return resposta({ answers: { intencao_de_compra: { type: "score", score: 3, confidence: 0.9 } } });
    });
    const r = await julgarComServico({ ...base, criterios: ["intencao_de_compra"], proximaAcao: false, negocios, cache: cacheEmMemoria(), fetchFn: fetchFn as unknown as typeof fetch });
    expect(n).toBe(3);
    expect(Object.keys(r.respostas).sort()).toEqual(["a", "c"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toMatchObject({ dealId: "b" });
    expect(r.falhas[0].motivo).toContain("HTTP 400");
  });

  it("limite de uso esgotado: o que sobrou fica pendente em vez de insistir", async () => {
    const fetchFn = vi.fn(async () => resposta({}, { status: 429 }));
    const r = await julgarComServico({
      ...base,
      negocios,
      cache: cacheEmMemoria(),
      fetchFn: fetchFn as unknown as typeof fetch,
      simultaneas: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(3); // 3 tentativas do primeiro negócio, nenhuma dos outros
    expect(r.falhas).toHaveLength(1);
    expect(r.pendentes.sort()).toEqual(["b", "c"]);
    expect(r.limiteAtingido).toBe(true);
  });

  it("passou do prazo: não começa chamada nova e devolve o parcial", async () => {
    let relogio = 0;
    const fetchFn = vi.fn(async () => {
      relogio += 30_000;
      return resposta({ answers: { intencao_de_compra: { type: "score", score: 1, confidence: 0.9 } } });
    });
    const r = await julgarComServico({
      ...base,
      criterios: ["intencao_de_compra"],
      proximaAcao: false,
      negocios,
      cache: cacheEmMemoria(),
      fetchFn: fetchFn as unknown as typeof fetch,
      simultaneas: 1,
      prazoMs: 45_000,
      agora: () => relogio,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2); // 0 s e 30 s; aos 60 s já passou do prazo
    expect(Object.keys(r.respostas).sort()).toEqual(["a", "b"]);
    expect(r.pendentes).toEqual(["c"]);
  });

  it("chave recusada interrompe o lote e lança (sem gastar chamadas à toa)", async () => {
    const fetchFn = vi.fn(async () => resposta({ error: "unauthorized" }, { status: 401 }));
    const erro = await julgarComServico({ ...base, negocios, cache: cacheEmMemoria(), fetchFn: fetchFn as unknown as typeof fetch, simultaneas: 1 }).catch((e) => e);
    expect(erro).toMatchObject({ code: "analisar_deals_key", status: 502 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("resposta fora do formato não vira resposta nem entra no cache", async () => {
    const fetchFn = vi.fn(async () => resposta({ answers: { intencao_de_compra: { type: "score", score: 99, confidence: 0.9 } } }));
    const cache = cacheEmMemoria();
    const r = await julgarComServico({ ...base, criterios: ["intencao_de_compra"], proximaAcao: false, negocios: negocios.slice(0, 1), cache, fetchFn: fetchFn as unknown as typeof fetch });
    expect(r.respostas).toEqual({});
    expect(r.falhas).toEqual([]);
    expect(cache.linhas.size).toBe(0);
  });
});

describe("julgarReduzido", () => {
  const openrouter = (conteudo: string) =>
    vi.fn(async () => resposta({ choices: [{ message: { content: conteudo } }] })) as unknown as typeof fetch;

  it("uma chamada para o lote todo; respostas marcadas como estimadas e guardadas", async () => {
    const fetchFn = openrouter('[{"i":0,"intencao_de_compra":3},{"i":1,"intencao_de_compra":1},{"i":2,"intencao_de_compra":0}]');
    const cache = cacheEmMemoria();
    const r = await julgarReduzido({ chave: "sk-or-1", negocios, criterios: ["intencao_de_compra"], proximaAcao: false, cache, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r.respostas.a).toEqual({ scores: { intencao_de_compra: { nivel: 3, confianca: null } }, estimado: true });
    expect(r.respostas.c.scores.intencao_de_compra?.nivel).toBe(0);
    expect(cache.linhas.size).toBe(3);
  });

  it("negócios já guardados não vão de novo ao modelo; se nada falta, nem chama", async () => {
    const fetchFn = openrouter('[{"i":0,"intencao_de_compra":2}]');
    const cache = cacheEmMemoria();
    await julgarReduzido({ chave: "sk-or-1", negocios: negocios.slice(0, 1), criterios: ["intencao_de_compra"], proximaAcao: false, cache, fetchFn });
    const outroFetch = openrouter("[]");
    const r = await julgarReduzido({ chave: "sk-or-1", negocios: negocios.slice(0, 1), criterios: ["intencao_de_compra"], proximaAcao: false, cache, fetchFn: outroFetch });
    expect(outroFetch).not.toHaveBeenCalled();
    expect(r.doCache).toBe(1);
    expect(r.respostas.a.estimado).toBe(true);
  });

  it("modelo que devolve lixo não gera resposta nem quebra", async () => {
    const r = await julgarReduzido({ chave: "sk-or-1", negocios, criterios: ["intencao_de_compra"], proximaAcao: false, cache: cacheEmMemoria(), fetchFn: openrouter("não sei") });
    expect(r.respostas).toEqual({});
  });
});

describe("cacheNoBanco", () => {
  const AGORA = Date.parse("2026-10-06T12:00:00Z");
  const hashes = new Map([["a", "h-a"], ["b", "h-b"]]);

  function bancoCom(linhas: unknown[], erroLeitura: { message: string } | null = null) {
    const upsert = vi.fn(async () => ({ error: null }));
    const filtros: unknown[][] = [];
    const consulta: Record<string, unknown> = {};
    consulta.select = () => consulta;
    consulta.eq = (...a: unknown[]) => (filtros.push(["eq", ...a]), consulta);
    consulta.in = (...a: unknown[]) => (filtros.push(["in", ...a]), consulta);
    consulta.then = (ok: (v: unknown) => unknown) => ok({ data: linhas, error: erroLeitura });
    const admin = { from: vi.fn(() => ({ ...consulta, upsert })) } as unknown as SupabaseClient;
    return { admin, upsert, filtros };
  }

  it("só devolve linha com o mesmo hash, dentro de 24 h e no formato conhecido", async () => {
    const recente = new Date(AGORA - 3_600_000).toISOString();
    const velho = new Date(AGORA - VALIDADE_DO_CACHE_MS - 1000).toISOString();
    const { admin, filtros } = bancoCom([
      { deal_id: "a", pergunta: "intencao_de_compra", hash: "h-a", criado_em: recente, resposta: { tipo: "score", nivel: 2, confianca: 0.7 } },
      { deal_id: "a", pergunta: "proxima_acao", hash: "h-a", criado_em: recente, resposta: { tipo: "choice", opcao: "aguardar", confianca: null } },
      { deal_id: "b", pergunta: "intencao_de_compra", hash: "OUTRO", criado_em: recente, resposta: { tipo: "score", nivel: 1, confianca: 0.7 } },
      { deal_id: "b", pergunta: "risco_de_perda", hash: "h-b", criado_em: velho, resposta: { tipo: "score", nivel: 1, confianca: 0.7 } },
      { deal_id: "b", pergunta: "urgencia_do_cliente", hash: "h-b", criado_em: recente, resposta: { tipo: "lixo" } },
    ]);
    const lidas = await cacheNoBanco(admin, "conta-1", () => AGORA).ler(hashes, ["intencao_de_compra", "proxima_acao"]);
    expect([...lidas.keys()]).toEqual(["a|intencao_de_compra", "a|proxima_acao"]);
    expect(lidas.get("a|proxima_acao")).toEqual({ tipo: "choice", opcao: "aguardar", confianca: null });
    // sempre filtra pela conta
    expect(filtros).toContainEqual(["eq", "account_id", "conta-1"]);
    expect(filtros).toContainEqual(["in", "deal_id", ["a", "b"]]);
  });

  it("erro de leitura vira cache vazio (a análise segue sem cache)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = bancoCom([], { message: "relation analisar_deals_cache does not exist" });
    expect((await cacheNoBanco(admin, "conta-1").ler(hashes, ["intencao_de_compra"])).size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("grava com upsert por (conta, negócio, pergunta)", async () => {
    const { admin, upsert } = bancoCom([]);
    await cacheNoBanco(admin, "conta-1", () => AGORA).gravar([
      { dealId: "a", pergunta: "intencao_de_compra", hash: "h-a", resposta: { tipo: "score", nivel: 2, confianca: 0.7 } },
    ]);
    expect(upsert).toHaveBeenCalledWith(
      [{ account_id: "conta-1", deal_id: "a", pergunta: "intencao_de_compra", hash: "h-a", resposta: { tipo: "score", nivel: 2, confianca: 0.7 }, criado_em: new Date(AGORA).toISOString() }],
      { onConflict: "account_id,deal_id,pergunta" },
    );
    await cacheNoBanco(admin, "conta-1").gravar([]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
