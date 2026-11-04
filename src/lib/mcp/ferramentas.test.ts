import { describe, expect, it } from "vitest";
import { adminFalso, ehDaConta, type Chamada } from "./admin-falso";
import { FERRAMENTAS } from "./ferramentas";
import { limparBusca } from "./ferramentas/contatos";
import { ErroDeFerramenta } from "./tipos";

const CONTA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const FUNIL = "44444444-4444-4444-8444-444444444444";
const ETAPA_1 = "55555555-5555-4555-8555-555555555551";
const ETAPA_2 = "55555555-5555-4555-8555-555555555552";
const ETAPA_OUTRO_FUNIL = "55555555-5555-4555-8555-555555555599";
const NEGOCIO = "66666666-6666-4666-8666-666666666666";
const CADENCIA = "77777777-7777-4777-8777-777777777777";

async function rodar(nome: string, args: unknown, roteiro: Record<string, unknown> = {}) {
  const f = FERRAMENTAS.find((x) => x.nome === nome)!;
  const { admin, chamadas } = adminFalso(roteiro as never);
  const entrada = f.entrada.parse(args);
  const resultado = await f.executar({ admin, accountId: CONTA, userId: USUARIO }, entrada).then(
    (valor) => ({ valor, erro: null as Error | null }),
    (erro: Error) => ({ valor: null, erro }),
  );
  return { ...resultado, chamadas };
}
const escritas = (cs: Chamada[]) => cs.filter((c) => c.op !== "select");

const etapas = [
  { id: ETAPA_2, name: "Proposta", position: 2, is_won: false },
  { id: ETAPA_1, name: "Novo", position: 1, is_won: false },
];

describe("isolamento por conta", () => {
  // Toda consulta a tabela com account_id precisa filtrar pela conta da chave; as exceções
  // são consultas encadeadas a um registro que já foi provado ser da conta.
  const SEM_FILTRO_PROPRIO = new Set(["pipeline_stages", "accounts"]);

  const casos: [string, unknown, Record<string, unknown>][] = [
    ["buscar_contatos", { busca: "ana" }, { contacts: { data: [] } }],
    ["listar_pipelines", {}, { pipelines: { data: [] } }],
    ["listar_cadencias", {}, { email_cadences: { data: [] } }],
    [
      "criar_negocio",
      { titulo: "X", contact_id: CONTATO, pipeline_id: FUNIL },
      {
        contacts: { data: { id: CONTATO, company_id: null } },
        pipelines: { data: { id: FUNIL } },
        pipeline_stages: { data: etapas },
        accounts: { data: { default_currency: "BRL" } },
        deals: { data: { id: NEGOCIO } },
      },
    ],
    [
      "mover_negocio",
      { deal_id: NEGOCIO, stage_id: ETAPA_2 },
      {
        deals: { data: { id: NEGOCIO, title: "N", status: "open", pipeline_id: FUNIL, stage_id: ETAPA_1 } },
        pipelines: { data: { id: FUNIL } },
        pipeline_stages: { data: etapas },
      },
    ],
    [
      "criar_tarefa",
      { titulo: "Ligar", contact_id: CONTATO, deal_id: NEGOCIO },
      { contacts: { data: { id: CONTATO } }, deals: { data: { id: NEGOCIO } }, tarefas: { data: { id: "t" } } },
    ],
    [
      "adicionar_nota",
      { contact_id: CONTATO, texto: "Falou com o diretor." },
      { contacts: { data: { id: CONTATO } }, contact_notes: { data: { id: "n" } } },
    ],
  ];

  // inclui o caminho feliz de criar_contato e inscrever_em_cadencia, que passam por código compartilhado
  casos.push(
    [
      "criar_contato",
      { name: "Ana Souza", email: "ana@x.com", empresa: { name: "XYZ" } },
      {
        companies: { data: { id: "co1", website: null, linkedin_url: null } },
        contacts: { data: null },
        "contacts:insert": { data: { id: CONTATO } },
      },
    ],
    [
      "inscrever_em_cadencia",
      { cadence_id: CADENCIA, contact_ids: [CONTATO] },
      {
        email_cadences: { data: { id: CADENCIA, status: "ativa" } },
        contacts: { data: [{ id: CONTATO, email: "ana@x.com", email_unsubscribed_at: null, company_id: "co1" }] },
        email_cadence_enrollments: { data: [] },
        "email_cadence_enrollments:upsert": { data: [{ id: "e1" }] },
        email_cadence_events: { data: null },
      },
    ],
  );

  it("toda ferramenta registrada tem um caso de isolamento (ferramenta nova sem caso reprova aqui)", () => {
    expect(casos.map(([nome]) => nome).sort()).toEqual(FERRAMENTAS.map((f) => f.nome).sort());
  });

  it.each(casos)("%s filtra e grava só na conta da chave", async (nome, args, roteiro) => {
    const { erro, chamadas } = await rodar(nome, args, roteiro);
    expect(erro).toBeNull();
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) {
      if (SEM_FILTRO_PROPRIO.has(c.tabela)) continue;
      expect(ehDaConta(c, CONTA), `${nome}: ${c.op} em ${c.tabela} sem filtro de conta`).toBe(true);
    }
  });

  it("um contato de outra conta é invisível: criar_negocio, tarefa e nota recusam sem gravar", async () => {
    const vazio = { contacts: { data: null }, deals: { data: null }, pipelines: { data: null } };
    for (const [nome, args] of [
      ["criar_negocio", { titulo: "X", contact_id: CONTATO, pipeline_id: FUNIL }],
      ["criar_tarefa", { titulo: "T", contact_id: CONTATO }],
      ["adicionar_nota", { contact_id: CONTATO, texto: "oi" }],
    ] as const) {
      const { erro, chamadas } = await rodar(nome, args, vazio);
      expect(erro).toBeInstanceOf(ErroDeFerramenta);
      expect(escritas(chamadas)).toHaveLength(0);
    }
  });
});

describe("buscar_contatos", () => {
  it("limpa o texto antes de montar o filtro (sem injetar condições)", () => {
    expect(limparBusca("ana,id.eq.1)")).toBe("ana id.eq.1");
    expect(limparBusca("100%_real")).toBe("100 real");
  });

  it("busca em nome, e-mail, empresa e, com dígitos, telefone", async () => {
    const { chamadas } = await rodar("buscar_contatos", { busca: "Ana 9999-0000" }, { contacts: { data: [] } });
    const or = chamadas[0].filtros.find((f) => f.tipo === "or")?.valor as string;
    expect(or).toContain("name.ilike.%Ana 9999-0000%");
    expect(or).toContain("email.ilike.");
    expect(or).toContain("company.ilike.");
    expect(or).toContain("phone_normalized.ilike.%99990000%");
  });

  it("sem busca não filtra por texto", async () => {
    const { chamadas } = await rodar("buscar_contatos", {}, { contacts: { data: [] } });
    expect(chamadas[0].filtros.some((f) => f.tipo === "or")).toBe(false);
  });

  it("recusa limite acima de 50", () => {
    const f = FERRAMENTAS.find((x) => x.nome === "buscar_contatos")!;
    expect(f.entrada.safeParse({ limite: 51 }).success).toBe(false);
  });
});

describe("criar_contato", () => {
  it("contato sem meio de contato é recusado antes de ir ao banco", async () => {
    const { erro, chamadas } = await rodar("criar_contato", { name: "Ana" });
    expect(erro).toBeInstanceOf(ErroDeFerramenta);
    expect(erro?.message).toContain("e-mail, telefone ou LinkedIn");
    expect(chamadas).toHaveLength(0);
  });
});

describe("criar_negocio", () => {
  const base = {
    contacts: { data: { id: CONTATO, company_id: "cc" } },
    pipelines: { data: { id: FUNIL } },
    pipeline_stages: { data: etapas },
    accounts: { data: { default_currency: "USD" } },
    deals: { data: { id: NEGOCIO } },
  };

  it("sem etapa entra na primeira do funil (por posição), em aberto, com a empresa do contato", async () => {
    const { valor, chamadas } = await rodar(
      "criar_negocio",
      { titulo: "Contrato anual", contact_id: CONTATO, pipeline_id: FUNIL, valor: 1500 },
      base,
    );
    const ins = chamadas.find((c) => c.op === "insert")!;
    expect(ins.payload).toMatchObject({
      account_id: CONTA,
      user_id: USUARIO,
      title: "Contrato anual",
      value: 1500,
      currency: "USD",
      stage_id: ETAPA_1,
      company_id: "cc",
      status: "open",
      temperature: "frio",
      source: "mcp",
    });
    expect(valor).toMatchObject({ deal_id: NEGOCIO, etapa: "Novo" });
  });

  it("etapa de outro funil é recusada sem gravar", async () => {
    const { erro, chamadas } = await rodar(
      "criar_negocio",
      { titulo: "X", contact_id: CONTATO, pipeline_id: FUNIL, stage_id: ETAPA_OUTRO_FUNIL },
      base,
    );
    expect(erro).toBeInstanceOf(ErroDeFerramenta);
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it("funil de outra conta não existe", async () => {
    const { erro, chamadas } = await rodar(
      "criar_negocio",
      { titulo: "X", contact_id: CONTATO, pipeline_id: FUNIL },
      { ...base, pipelines: { data: null } },
    );
    expect(erro?.message).toContain("Funil não encontrado");
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it("moeda informada vale, em maiúsculas", async () => {
    const { chamadas } = await rodar(
      "criar_negocio",
      { titulo: "X", contact_id: CONTATO, pipeline_id: FUNIL, moeda: "eur" },
      base,
    );
    expect(chamadas.find((c) => c.op === "insert")?.payload).toMatchObject({ currency: "EUR" });
  });
});

describe("mover_negocio", () => {
  const negocio = (status = "open", stage = ETAPA_1) => ({
    deals: { data: { id: NEGOCIO, title: "N", status, pipeline_id: FUNIL, stage_id: stage } },
    pipelines: { data: { id: FUNIL } },
    pipeline_stages: { data: etapas },
  });

  it("move para outra etapa do mesmo funil, só trocando stage_id e na conta", async () => {
    const { valor, chamadas } = await rodar("mover_negocio", { deal_id: NEGOCIO, stage_id: ETAPA_2 }, negocio());
    const up = chamadas.find((c) => c.op === "update")!;
    expect(up.payload).toEqual({ stage_id: ETAPA_2 });
    expect(up.filtros).toContainEqual({ tipo: "eq", coluna: "account_id", valor: CONTA });
    expect(valor).toMatchObject({ movido: true, de: "Novo", para: "Proposta" });
  });

  it("negócio ganho ou perdido não é movido", async () => {
    for (const status of ["won", "lost"]) {
      const { erro, chamadas } = await rodar("mover_negocio", { deal_id: NEGOCIO, stage_id: ETAPA_2 }, negocio(status));
      expect(erro).toBeInstanceOf(ErroDeFerramenta);
      expect(escritas(chamadas)).toHaveLength(0);
    }
  });

  it("etapa de outro funil é recusada", async () => {
    const { erro, chamadas } = await rodar("mover_negocio", { deal_id: NEGOCIO, stage_id: ETAPA_OUTRO_FUNIL }, negocio());
    expect(erro).toBeInstanceOf(ErroDeFerramenta);
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it("já estar na etapa não grava nada", async () => {
    const { valor, chamadas } = await rodar("mover_negocio", { deal_id: NEGOCIO, stage_id: ETAPA_2 }, negocio("open", ETAPA_2));
    expect(valor).toMatchObject({ movido: false });
    expect(escritas(chamadas)).toHaveLength(0);
  });
});

describe("criar_tarefa", () => {
  it("responsável de fora da conta é recusado sem gravar", async () => {
    const { erro, chamadas } = await rodar(
      "criar_tarefa",
      { titulo: "Ligar", responsavel_id: "88888888-8888-4888-8888-888888888888" },
      { profiles: { data: null } },
    );
    expect(erro?.message).toContain("não pertence");
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it("sem responsável fica com o dono da chave, já vista, e é manual", async () => {
    const { chamadas } = await rodar("criar_tarefa", { titulo: "Ligar" }, { tarefas: { data: { id: "t" } } });
    const p = chamadas.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(p).toMatchObject({ account_id: CONTA, responsavel_id: USUARIO, criada_por: USUARIO, origem: "manual", tipo: "outra" });
    expect(p.vista_em).toBeTruthy();
  });

  it("tarefa de negócio sem contato herda o contato principal", async () => {
    const { chamadas } = await rodar(
      "criar_tarefa",
      { titulo: "Follow-up", deal_id: NEGOCIO },
      {
        deals: { data: { id: NEGOCIO } },
        deal_contacts: { data: { contact_id: CONTATO } },
        tarefas: { data: { id: "t" } },
      },
    );
    expect(chamadas.find((c) => c.op === "insert")?.payload).toMatchObject({ contact_id: CONTATO, deal_id: NEGOCIO });
  });

  it("recusa campo desconhecido (como a API da tela)", () => {
    const f = FERRAMENTAS.find((x) => x.nome === "criar_tarefa")!;
    expect(f.entrada.safeParse({ titulo: "x", account_id: CONTA }).success).toBe(false);
  });
});

describe("adicionar_nota", () => {
  it("grava a nota com a conta e o dono da chave", async () => {
    const { chamadas } = await rodar(
      "adicionar_nota",
      { contact_id: CONTATO, texto: "  Pediu proposta.  " },
      { contacts: { data: { id: CONTATO } }, contact_notes: { data: { id: "n" } } },
    );
    expect(chamadas.find((c) => c.op === "insert")?.payload).toEqual({
      account_id: CONTA,
      contact_id: CONTATO,
      user_id: USUARIO,
      note_text: "Pediu proposta.",
    });
  });
});

describe("inscrever_em_cadencia", () => {
  const f = FERRAMENTAS.find((x) => x.nome === "inscrever_em_cadencia")!;

  it("exige deal_id OU contact_ids, e contact_id só com deal_id", () => {
    expect(f.entrada.safeParse({ cadence_id: CADENCIA }).success).toBe(false);
    expect(f.entrada.safeParse({ cadence_id: CADENCIA, deal_id: NEGOCIO, contact_ids: [CONTATO] }).success).toBe(false);
    expect(f.entrada.safeParse({ cadence_id: CADENCIA, contact_id: CONTATO, contact_ids: [CONTATO] }).success).toBe(false);
    expect(f.entrada.safeParse({ cadence_id: CADENCIA, deal_id: NEGOCIO }).success).toBe(true);
    expect(f.entrada.safeParse({ cadence_id: CADENCIA, contact_ids: [CONTATO] }).success).toBe(true);
  });

  it("cadência de outra conta (ou inexistente) é recusada sem gravar", async () => {
    const { erro, chamadas } = await rodar(
      "inscrever_em_cadencia",
      { cadence_id: CADENCIA, contact_ids: [CONTATO] },
      { email_cadences: { data: null } },
    );
    expect(erro).toBeInstanceOf(ErroDeFerramenta);
    expect(erro?.message).toContain("Cadência não encontrada");
    expect(escritas(chamadas)).toHaveLength(0);
    expect(chamadas[0].filtros).toContainEqual({ tipo: "eq", coluna: "account_id", valor: CONTA });
  });

  it("cadência que não está ativa não recebe inscrições", async () => {
    const { erro, chamadas } = await rodar(
      "inscrever_em_cadencia",
      { cadence_id: CADENCIA, contact_ids: [CONTATO] },
      { email_cadences: { data: { id: CADENCIA, status: "pausada" } } },
    );
    expect(erro?.message).toContain("precisa estar ativa");
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it("contato sem e-mail ou descadastrado não entra", async () => {
    const { erro, chamadas } = await rodar(
      "inscrever_em_cadencia",
      { cadence_id: CADENCIA, contact_ids: [CONTATO] },
      {
        email_cadences: { data: { id: CADENCIA, status: "ativa" } },
        contacts: { data: [{ id: CONTATO, email: null, email_unsubscribed_at: null, company_id: null }] },
        email_cadence_enrollments: { data: [] },
      },
    );
    expect(erro?.message).toContain("Nenhum contato pode receber e-mail");
    expect(escritas(chamadas)).toHaveLength(0);
  });
});
