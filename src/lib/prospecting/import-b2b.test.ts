import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/companies", () => ({ obterOuCriarEmpresa: vi.fn(async () => "emp-1") }));

import { MSG_PEDIU_PARA_SAIR } from "./errors";
import { importarCandidatos } from "./import";
import { MSG_AINDA_PROCURANDO_EMAIL } from "./importavel";

/**
 * Importar para o funil, lado B2B, contra um banco falso que registra o que foi
 * gravado. O que se prova aqui é a LIGAÇÃO: lead sem e-mail verificado vira
 * contato (com a base legal da busca) e negócio; quem pediu para sair, não.
 */
interface Op {
  tabela: string;
  acao: "select" | "insert" | "update";
  filtros: Record<string, unknown>;
  linha?: Record<string, unknown>;
}

const LIA = "LIA-2026-017";
const CONTA = "conta-1";
const USUARIO = "usuario-1";
const lead = {
  key: "k1",
  fullName: "Henrique Andrade Godoy",
  title: "Gerente de logística",
  companyName: "Sylvamo",
  companyDomain: "sylvamo.com",
  location: null,
  linkedin: "https://www.linkedin.com/in/henrique-andrade-godoy-73650222",
  email: null,
  emailVerified: false,
};

let ops: Op[];
let cands: unknown[];
let contatoPorLinkedin: { id: string; email_unsubscribed_at: string | null } | null;

function candidato(o: Partial<{ id: string; status: string; contact_id: string | null; error: string | null; search: unknown }>) {
  return {
    id: o.id ?? "cand-1",
    status: o.status ?? "skipped",
    contact_id: o.contact_id ?? null,
    deal_id: null,
    error: o.error ?? "Sem e-mail comercial verificado.",
    data: lead,
    prospecting_campaigns: {
      id: "camp-1",
      name: "Logística · Sylvamo",
      kind: "b2b",
      search: "search" in o ? o.search : { legal_basis_ref: LIA },
    },
  };
}

function responder(op: Op): { data?: unknown; error?: unknown } {
  switch (op.tabela) {
    case "pipeline_stages":
      return { data: { id: "etapa-1" } };
    case "profiles":
      return { data: { id: "perfil-1" } };
    case "prospecting_candidates":
      return op.acao === "select" ? { data: cands } : { data: null };
    case "contacts":
      if (op.acao === "insert") return { data: { id: "contato-novo" }, error: null };
      if ("linkedin_url" in op.filtros) return { data: contatoPorLinkedin };
      // conferência do contato já resolvido (descadastro)
      return { data: contatoPorLinkedin?.id === op.filtros.id ? contatoPorLinkedin : { id: op.filtros.id, email_unsubscribed_at: null } };
    case "deals":
      return op.acao === "insert" ? { data: { id: "negocio-1" }, error: null } : { data: null };
    default:
      return { data: null };
  }
}

function criarAdmin() {
  return {
    rpc: async () => ({ data: true, error: null }),
    from(tabela: string) {
      const op: Op = { tabela, acao: "select", filtros: {} };
      const termina = () => {
        ops.push(op);
        return responder(op);
      };
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (linha: Record<string, unknown>) => ((op.acao = "insert"), (op.linha = linha), b),
        update: (linha: Record<string, unknown>) => ((op.acao = "update"), (op.linha = linha), b),
        eq: (c: string, v: unknown) => ((op.filtros[c] = v), b),
        in: (c: string, v: unknown) => ((op.filtros[c] = v), b),
        ilike: (c: string, v: unknown) => ((op.filtros[`ilike:${c}`] = v), b),
        limit: () => b,
        maybeSingle: async () => termina(),
        single: async () => termina(),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(termina()).then(res, rej),
      };
      return b;
    },
  } as never;
}

const importar = () =>
  importarCandidatos(criarAdmin(), {
    accountId: CONTA,
    userId: USUARIO,
    kind: "b2b",
    candidateIds: ["cand-1"],
    pipelineId: "funil-1",
    stageId: "etapa-1",
  });
const gravado = (tabela: string, acao: Op["acao"]) => ops.filter((o) => o.tabela === tabela && o.acao === acao);

beforeEach(() => {
  ops = [];
  cands = [];
  contatoPorLinkedin = null;
});

describe("importar lead B2B sem e-mail verificado", () => {
  it("cria o contato com a base legal da busca e leva o negócio ao funil", async () => {
    cands = [candidato({ status: "skipped" })];

    const r = await importar();

    expect(r).toEqual({ imported: 1, already: 0, skipped: [] });
    const contato = gravado("contacts", "insert")[0]!.linha!;
    expect(contato).toMatchObject({
      account_id: CONTA,
      user_id: USUARIO,
      name: "Henrique Andrade Godoy",
      email: null,
      phone: "",
      job_title: "Gerente de logística",
      linkedin_url: lead.linkedin,
      company_id: "emp-1",
      source: "prospecting",
      consent: { legitimate_interest: { ref: LIA } },
    });
    const negocio = gravado("deals", "insert")[0]!.linha!;
    expect(negocio).toMatchObject({
      contact_id: "contato-novo",
      company_id: "emp-1",
      linkedin_url: lead.linkedin,
      title: "Henrique Andrade Godoy · Sylvamo",
      pipeline_id: "funil-1",
      stage_id: "etapa-1",
      source: "prospecting",
    });
    // O candidato fica ligado ao contato e ao negócio criados.
    expect(gravado("prospecting_candidates", "update").at(-1)!.linha).toEqual({ contact_id: "contato-novo", deal_id: "negocio-1" });
  });

  it("aceita também o lead que falhou na revelação (failed)", async () => {
    cands = [candidato({ status: "failed", error: "Falha ao revelar o e-mail." })];
    expect((await importar()).imported).toBe(1);
  });

  it("reaproveita o contato que já tem o mesmo LinkedIn, em vez de duplicar", async () => {
    cands = [candidato({ status: "skipped" })];
    contatoPorLinkedin = { id: "contato-existente", email_unsubscribed_at: null };

    const r = await importar();

    expect(r.imported).toBe(1);
    expect(gravado("contacts", "insert")).toHaveLength(0);
    expect(gravado("deals", "insert")[0]!.linha).toMatchObject({ contact_id: "contato-existente" });
  });

  it("não leva ao funil quem já é contato e pediu para sair", async () => {
    cands = [candidato({ status: "skipped" })];
    contatoPorLinkedin = { id: "contato-existente", email_unsubscribed_at: "2026-09-01T00:00:00Z" };

    const r = await importar();

    expect(r.skipped).toEqual([{ id: "cand-1", reason: MSG_PEDIU_PARA_SAIR }]);
    expect(gravado("contacts", "insert")).toHaveLength(0);
    expect(gravado("deals", "insert")).toHaveLength(0);
  });

  it("não cria contato novo para o candidato que o worker pulou porque a pessoa pediu para sair", async () => {
    cands = [candidato({ status: "skipped", error: MSG_PEDIU_PARA_SAIR })];

    const r = await importar();

    expect(r.skipped).toEqual([{ id: "cand-1", reason: MSG_PEDIU_PARA_SAIR }]);
    expect(gravado("contacts", "insert")).toHaveLength(0);
    expect(gravado("deals", "insert")).toHaveLength(0);
  });

  it("espera o lead que ainda está na fila de revelação", async () => {
    cands = [candidato({ status: "new", error: null })];

    const r = await importar();

    expect(r.skipped).toEqual([{ id: "cand-1", reason: MSG_AINDA_PROCURANDO_EMAIL }]);
    expect(gravado("contacts", "insert")).toHaveLength(0);
  });

  it("não cria contato sem a base legal que a busca registrou", async () => {
    cands = [candidato({ status: "skipped", search: {} })];

    const r = await importar();

    expect(r.skipped).toEqual([
      { id: "cand-1", reason: "A busca não guardou a base legal (legítimo interesse) deste lead." },
    ]);
    expect(gravado("contacts", "insert")).toHaveLength(0);
  });
});

describe("importar lead B2B com e-mail verificado (caminho de sempre)", () => {
  it("usa o contato que a busca já criou, sem criar outro", async () => {
    cands = [candidato({ status: "enriched", contact_id: "contato-da-busca", error: null })];

    const r = await importar();

    expect(r.imported).toBe(1);
    expect(gravado("contacts", "insert")).toHaveLength(0);
    expect(gravado("deals", "insert")[0]!.linha).toMatchObject({ contact_id: "contato-da-busca" });
  });
});
