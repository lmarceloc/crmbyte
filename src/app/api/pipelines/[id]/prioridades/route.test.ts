import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET } from "./route";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const ETAPA = "22222222-2222-4222-8222-222222222222";
const DONO = "33333333-3333-4333-8333-333333333333";

type Resposta = { data: unknown; error?: { message: string } | null; count?: number | null };

/** Cliente Supabase falso: cada tabela devolve a resposta dada e registra as chamadas encadeadas. */
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
                Promise.resolve({ data: r.data, error: r.error ?? null, count: r.count ?? null }).then(ok, ko);
            return (...args: unknown[]) => {
              reg.chamadas.push([prop, ...args]);
              if (prop === "maybeSingle") {
                const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
                return Promise.resolve({ data: d, error: r.error ?? null });
              }
              return consulta;
            };
          },
        },
      );
      return consulta;
    },
  };
}

const AGORA = Date.now();
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();
const negocio = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `d${i}`,
  title: `Negócio ${i}`,
  value: 1000 + i,
  currency: "BRL",
  notes: null,
  expected_close_date: null,
  temperature: null,
  stage_id: ETAPA,
  stage_entered_at: dias(3),
  updated_at: dias(i),
  created_at: dias(60),
  assigned_to: null,
  stage: { name: "Proposta" },
  company: { name: "Empresa" },
  contact: { name: "Ana", contact_notes: [], conversations: [] },
  enrollments: [],
  tarefas: [],
  ...extra,
});

function preparar(tabelas: Record<string, Resposta>) {
  const supabase = supabaseFalso({ pipelines: { data: [{ id: FUNIL }] }, ...tabelas });
  requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase });
  return supabase;
}

const chamar = (query = "", id = FUNIL) =>
  GET(new Request(`http://x/api/pipelines/${id}/prioridades${query}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  obterChave.mockImplementation(() => null);
});

describe("GET /api/pipelines/[id]/prioridades", () => {
  it("exige o papel de agent", async () => {
    preparar({ deals: { data: [] } });
    await chamar();
    expect(requireRole).toHaveBeenCalledWith("agent");
  });

  it("id de funil inválido é 404 sem consultar nada", async () => {
    const r = await chamar("", "nao-e-uuid");
    expect(r.status).toBe(404);
  });

  it("funil que o usuário não enxerga (RLS) é 404", async () => {
    const supabase = supabaseFalso({ pipelines: { data: [] } });
    requireRole.mockResolvedValue({ accountId: "conta-1", userId: "u1", role: "agent", supabase });
    expect((await chamar()).status).toBe(404);
  });

  it.each([
    ["critério desconhecido", "?criterios=sem_contato,inventado"],
    ["etapa que não é uuid", "?etapas=abc"],
    ["responsável que não é uuid", "?responsavel=eu"],
  ])("%s é 422", async (_nome, query) => {
    preparar({ deals: { data: [] } });
    expect((await chamar(query)).status).toBe(422);
  });

  it("devolve os sinais dos negócios abertos do funil, com os filtros da tela", async () => {
    const supabase = preparar({ deals: { data: [negocio(2), negocio(5)], count: 2 } });
    const r = await chamar(`?criterios=sem_contato&etapas=${ETAPA}&responsavel=${DONO}`);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ total: 2, analisados: 2, ficaram_de_fora: 0, limite: 100, ia: { modo: "nenhuma" } });
    expect(corpo.negocios.map((n: { id: string }) => n.id)).toEqual(["d2", "d5"]);
    expect(corpo.negocios[0]).toMatchObject({ titulo: "Negócio 2", empresa: "Empresa", etapa: "Proposta", diasSemAtualizar: 2, diasSemContato: null });

    const consulta = supabase.registro.find((q) => q.tabela === "deals")!.chamadas;
    expect(consulta).toContainEqual(["eq", "pipeline_id", FUNIL]);
    expect(consulta).toContainEqual(["or", "status.eq.open,status.is.null"]);
    expect(consulta).toContainEqual(["in", "stage_id", [ETAPA]]);
    expect(consulta).toContainEqual(["eq", "assigned_to", DONO]);
    expect(consulta).toContainEqual(["limit", 1000]);
  });

  it("não vaza a configuração interna nem o texto das notas: só sinais", async () => {
    preparar({ deals: { data: [negocio(1, { notes: "segredo de negociação" })] } });
    const corpo = await (await chamar()).json();
    expect(JSON.stringify(corpo)).not.toContain("segredo de negociação");
    expect(corpo.negocios[0].temTextoParaIa).toBe(true);
  });

  it("com mais de 100 negócios, analisa os 100 que mais pedem atenção pelos critérios escolhidos", async () => {
    const todos = Array.from({ length: 130 }, (_, i) => negocio(i + 1)); // d1 = mexido ontem … d130 = há 130 dias
    preparar({ deals: { data: todos, count: 130 } });
    const corpo = await (await chamar("?criterios=sem_atualizacao")).json();
    expect(corpo).toMatchObject({ total: 130, analisados: 100, ficaram_de_fora: 30 });
    const ids = new Set(corpo.negocios.map((n: { id: string }) => n.id));
    expect(ids.has("d130")).toBe(true); // o mais abandonado entra
    expect(ids.has("d31")).toBe(true); // o 100º mais abandonado
    expect(ids.has("d30")).toBe(false);
    expect(ids.has("d1")).toBe(false); // o mais recente fica de fora
  });

  it("a seleção ignora critérios de IA (ainda não rodaram) e, sem critério de regra, usa o equilibrado", async () => {
    const todos = Array.from({ length: 105 }, (_, i) => negocio(i + 1, { stage_entered_at: dias(i + 1) }));
    preparar({ deals: { data: todos, count: 105 } });
    const corpo = await (await chamar("?criterios=intencao_de_compra")).json();
    expect(corpo.analisados).toBe(100);
    expect(corpo.ficaram_de_fora).toBe(5);
  });

  it("o total vem da contagem do banco mesmo quando só parte dos negócios foi lida", async () => {
    preparar({ deals: { data: [negocio(1)], count: 1500 } });
    const corpo = await (await chamar()).json();
    expect(corpo).toMatchObject({ total: 1500, analisados: 1, ficaram_de_fora: 1499 });
  });

  it("usa os pesos da conta; sem a tabela (migration 045) cai no padrão", async () => {
    preparar({
      deals: { data: [negocio(1)] },
      analisar_deals_config: { data: { config: { diasSemContato: 3, pesos: { sem_contato: 9 } } } },
    });
    const salvo = await (await chamar()).json();
    expect(salvo.config.diasSemContato).toBe(3);
    expect(salvo.config.pesos.sem_contato).toBe(9);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    preparar({ deals: { data: [negocio(1)] }, analisar_deals_config: { data: null, error: { message: "relation does not exist" } } });
    const padrao = await (await chamar()).json();
    expect(padrao.config.diasSemContato).toBe(7);
    spy.mockRestore();
  });

  it("informa que IA está disponível: serviço, modo reduzido ou nenhuma", async () => {
    preparar({ deals: { data: [] } });
    obterChave.mockImplementation((p: string) => (p === "analisar_deals" ? "apikey_x" : "sk-or"));
    expect((await (await chamar()).json()).ia.modo).toBe("servico");
    obterChave.mockImplementation((p: string) => (p === "openrouter" ? "sk-or" : null));
    expect((await (await chamar()).json()).ia.modo).toBe("reduzido");
    obterChave.mockImplementation(() => null);
    expect((await (await chamar()).json()).ia.modo).toBe("nenhuma");
  });

  it("erro do banco vira 500 com o código db_error", async () => {
    preparar({ deals: { data: null, error: { message: "boom" } } });
    const r = await chamar();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe("db_error");
  });
});
