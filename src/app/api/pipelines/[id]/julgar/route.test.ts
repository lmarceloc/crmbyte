import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheDeRespostas, RespostaGuardada } from "@/lib/ia/julgar-negocios";
import { chaveDoCache } from "@/lib/ia/julgar-negocios";

const requireRole = vi.fn();
vi.mock("@/lib/auth/account", () => ({
  requireRole: (min: string) => requireRole(min),
  toErrorResponse: (e: unknown) =>
    Response.json({ error: e instanceof Error ? e.message : "erro" }, { status: (e as { status?: number })?.status ?? 500 }),
}));
vi.mock("@/lib/automations/admin-client", () => ({ supabaseAdmin: () => ({}) }));
const obterChave = vi.fn();
vi.mock("@/lib/integracoes/chaves", () => ({
  obterChave: (_admin: unknown, _conta: string, provedor: string) => obterChave(provedor),
}));

// cache em memória no lugar do banco
const linhasDoCache = new Map<string, { hash: string; resposta: RespostaGuardada }>();
const cacheFalso: CacheDeRespostas = {
  async ler(hashes, perguntas) {
    const r = new Map<string, RespostaGuardada>();
    for (const [deal, hash] of hashes)
      for (const p of perguntas) {
        const l = linhasDoCache.get(chaveDoCache(deal, p));
        if (l && l.hash === hash) r.set(chaveDoCache(deal, p), l.resposta);
      }
    return r;
  },
  async gravar(novas) {
    for (const n of novas) linhasDoCache.set(chaveDoCache(n.dealId, n.pergunta), { hash: n.hash, resposta: n.resposta });
  },
};
vi.mock("@/lib/ia/cache-analisar-deals", () => ({ cacheNoBanco: () => cacheFalso }));

import { POST } from "./route";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const D2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const D3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const CONVERSA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

type Resposta = { data: unknown; error?: { message: string } | null };

function supabaseFalso(tabelas: Record<string, Resposta>) {
  const registro: { tabela: string; chamadas: unknown[][] }[] = [];
  return {
    registro,
    from(tabela: string) {
      const reg = { tabela, chamadas: [] as unknown[][] };
      registro.push(reg);
      const r = tabelas[tabela] ?? { data: [] };
      const consulta: unknown = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === "then")
              return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
                Promise.resolve({ data: r.data, error: r.error ?? null }).then(ok, ko);
            return (...args: unknown[]) => (reg.chamadas.push([prop, ...args]), consulta);
          },
        },
      );
      return consulta;
    },
  };
}

const AGORA = Date.now();
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();
const negocio = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Negócio ${id.slice(-1)}`,
  value: 42000,
  currency: "BRL",
  notes: null,
  expected_close_date: null,
  stage_id: "e1",
  stage_entered_at: dias(4),
  updated_at: dias(2),
  created_at: dias(30),
  contact_id: C1,
  stage: { name: "Proposta" },
  company: { name: "Top Flex" },
  deal_contacts: [{ contact_id: C1 }],
  ...extra,
});

function preparar(tabelas: Record<string, Resposta>) {
  const supabase = supabaseFalso(tabelas);
  requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase });
  return supabase;
}

/** Serviço falso: devolve intenção 2 e ação "enviar_proposta"; guarda o que recebeu. */
const enviados: { url: string; autorizacao: string; corpo: { state: { negocio: { titulo: string } }; questions: Record<string, unknown> } }[] = [];
function servico(status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const corpo = JSON.parse(init.body as string);
      enviados.push({ url, autorizacao: (init.headers as Record<string, string>).Authorization, corpo });
      if (status !== 200) return new Response(JSON.stringify({ error: "x" }), { status });
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(corpo.questions as Record<string, { type: string }>))
        answers[id] = q.type === "score" ? { type: "score", score: 2, confidence: 0.9 } : { type: "choice", choice: "enviar_proposta", confidence: 0.8 };
      return new Response(JSON.stringify({ answers, usage: { input_tokens: 10, output_tokens: 2 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}

const chamar = (corpo: unknown, id = FUNIL) =>
  POST(new Request(`http://x/api/pipelines/${id}/julgar`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ id }),
  });

const pedido = { deal_ids: [D1], criterios: ["intencao_de_compra"], proxima_acao: true };

beforeEach(() => {
  enviados.length = 0;
  linhasDoCache.clear();
  obterChave.mockImplementation((p: string) => (p === "analisar_deals" ? "apikey_secreta_de_teste" : null));
  servico();
});

describe("POST /api/pipelines/[id]/julgar", () => {
  it("exige o papel de agent e valida o corpo", async () => {
    preparar({});
    await chamar(pedido);
    expect(requireRole).toHaveBeenCalledWith("agent");
    expect((await chamar({ ...pedido, criterios: [], proxima_acao: false })).status).toBe(422);
    expect((await chamar({ ...pedido, criterios: ["sem_contato"] })).status).toBe(422); // critério de regra não vai para a IA
    expect((await chamar({ ...pedido, deal_ids: [] })).status).toBe(422);
    expect((await chamar({ ...pedido, deal_ids: ["x"] })).status).toBe(422);
    expect((await chamar({ ...pedido, extra: 1 })).status).toBe(422);
    const vinteUm = Array.from({ length: 21 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
    expect((await chamar({ ...pedido, deal_ids: vinteUm })).status).toBe(422);
    expect((await chamar(pedido, "nao-e-uuid")).status).toBe(404);
  });

  it("sem nenhuma das duas chaves, pede para cadastrar e não consulta o banco", async () => {
    const supabase = preparar({});
    obterChave.mockImplementation(() => null);
    const r = await chamar(pedido);
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("analisar_deals_sem_chave");
    expect(supabase.registro).toHaveLength(0);
  });

  it("monta o texto no servidor: sem e-mail nem telefone, com a chave só no cabeçalho", async () => {
    preparar({
      deals: { data: [negocio(D1, { notes: "contato direto: ana@topflex.com ou (11) 99999-8888" })] },
      contact_notes: { data: [{ contact_id: C1, created_at: dias(1), note_text: "pediu desconto, fala no 11 98888-7777" }] },
      conversations: { data: [{ id: CONVERSA, contact_id: C1 }] },
      messages: { data: [{ conversation_id: CONVERSA, created_at: dias(0), content_text: "manda a proposta para joao@x.com" }] },
    });
    const r = await chamar(pedido);
    expect(r.status).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(enviados[0].autorizacao).toBe("Bearer apikey_secreta_de_teste");
    const texto = JSON.stringify(enviados[0].corpo);
    expect(texto).not.toMatch(/@|99999|98888/);
    expect(texto).not.toContain("apikey_secreta_de_teste");
    expect(enviados[0].corpo.state).toMatchObject({
      negocio: { titulo: "Negócio 1", empresa: "Top Flex", etapa: "Proposta", valor: 42000, dias_na_etapa: 4 },
      notas: [{ texto: "pediu desconto, fala no [telefone]" }],
      mensagens_do_cliente: [{ texto: "manda a proposta para [e-mail]" }],
    });
    expect(Object.keys(enviados[0].corpo.questions)).toEqual(["intencao_de_compra", "proxima_acao"]);
  });

  it("devolve as respostas por negócio, o modo e o uso", async () => {
    preparar({ deals: { data: [negocio(D1, { notes: "quer proposta" })] } });
    const corpo = await (await chamar(pedido)).json();
    expect(corpo.modo).toBe("servico");
    expect(corpo.resultados[D1]).toEqual({
      scores: { intencao_de_compra: { nivel: 2, confianca: 0.9 } },
      acao: { opcao: "enviar_proposta", confianca: 0.8 },
      estimado: false,
    });
    expect(corpo).toMatchObject({ sem_dados: [], falhas: [], pendentes: [], limite_de_uso: false, do_cache: 0, uso: { entrada: 10, saida: 2 } });
    expect(JSON.stringify(corpo)).not.toContain("apikey_secreta_de_teste");
  });

  it("negócio sem nada para ler não é enviado à IA", async () => {
    preparar({ deals: { data: [negocio(D1, { notes: "quer proposta" }), negocio(D2)] } });
    const corpo = await (await chamar({ ...pedido, deal_ids: [D1, D2] })).json();
    expect(enviados.map((e) => e.corpo.state.negocio.titulo)).toEqual(["Negócio 1"]);
    expect(corpo.sem_dados).toEqual([D2]);
    expect(Object.keys(corpo.resultados)).toEqual([D1]);
  });

  it("lê as notas de todos os contatos do negócio e as mensagens das conversas deles", async () => {
    const supabase = preparar({
      deals: { data: [negocio(D1, { deal_contacts: [{ contact_id: C1 }, { contact_id: C2 }] })] },
      contact_notes: { data: [{ contact_id: C2, created_at: dias(1), note_text: "segundo contato quer fechar" }] },
    });
    const corpo = await (await chamar(pedido)).json();
    const notas = supabase.registro.find((q) => q.tabela === "contact_notes")!.chamadas;
    expect(notas).toContainEqual(["in", "contact_id", [C1, C2]]);
    expect(enviados[0].corpo.state).toMatchObject({ notas: [{ texto: "segundo contato quer fechar" }] });
    expect(corpo.falhas).toEqual([]);
  });

  it("só negócios do funil da URL e da conta do usuário (filtro + RLS); o que não vier é reportado", async () => {
    const supabase = preparar({ deals: { data: [negocio(D1, { notes: "x" })] } });
    const corpo = await (await chamar({ ...pedido, deal_ids: [D1, D3] })).json();
    const deals = supabase.registro.find((q) => q.tabela === "deals")!.chamadas;
    expect(deals).toContainEqual(["eq", "pipeline_id", FUNIL]);
    expect(corpo.falhas).toEqual([{ deal_id: D3, motivo: "Negócio não encontrado neste funil." }]);
  });

  it("segunda análise usa o cache e não chama o serviço de novo", async () => {
    preparar({ deals: { data: [negocio(D1, { notes: "quer proposta" })] } });
    await chamar(pedido);
    expect(enviados).toHaveLength(1);
    const corpo = await (await chamar(pedido)).json();
    expect(enviados).toHaveLength(1);
    expect(corpo.do_cache).toBe(1);
    expect(corpo.resultados[D1].scores.intencao_de_compra.nivel).toBe(2);
  });

  it("limite de uso do serviço: avisa para a tela não pedir os próximos blocos", async () => {
    servico(429);
    preparar({ deals: { data: [negocio(D1, { notes: "x" })] } });
    const corpo = await (await chamar(pedido)).json();
    expect(corpo.limite_de_uso).toBe(true);
    expect(corpo.falhas).toHaveLength(1);
  });

  it("chave recusada: 502 com o código e a mensagem para a tela", async () => {
    servico(401);
    preparar({ deals: { data: [negocio(D1, { notes: "x" })] } });
    const r = await chamar(pedido);
    expect(r.status).toBe(502);
    const corpo = await r.json();
    expect(corpo.code).toBe("analisar_deals_key");
    expect(corpo.error).toContain("Configurações → Chaves de API");
  });

  it("sem a chave do serviço usa o OpenRouter em modo reduzido (estimado) e limita a 10 negócios", async () => {
    obterChave.mockImplementation((p: string) => (p === "openrouter" ? "sk-or-1" : null));
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '[{"i":0,"intencao_de_compra":3,"proxima_acao":"agendar_reuniao"}]' } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    preparar({ deals: { data: [negocio(D1, { notes: "quer proposta" })] } });
    const corpo = await (await chamar(pedido)).json();
    expect(corpo.modo).toBe("reduzido");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(corpo.resultados[D1]).toEqual({
      scores: { intencao_de_compra: { nivel: 3, confianca: null } },
      acao: { opcao: "agendar_reuniao", confianca: null },
      estimado: true,
    });

    const onze = Array.from({ length: 11 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
    const r = await chamar({ ...pedido, deal_ids: onze });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain("no máximo 10");
  });

  it("erro do banco vira 500 db_error e nada vai para a IA", async () => {
    preparar({ deals: { data: null, error: { message: "boom" } } });
    const r = await chamar(pedido);
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe("db_error");
    expect(enviados).toHaveLength(0);
  });
});
