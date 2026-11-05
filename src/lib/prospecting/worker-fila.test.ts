import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/assinatura/acesso", () => ({ contasBloqueadas: vi.fn(async () => []) }));
vi.mock("@/lib/integracoes/chaves", () => ({ obterChave: vi.fn(async () => null) }));

import { campanhasB2bComPendentes, processarProspeccao } from "./worker";

/**
 * Fila da revelação: só entram as buscas B2B que ainda têm lead `new`. Antes,
 * toda B2B concluída entrava, e as duas mais antigas (já sem pendência)
 * ocupavam a rodada da conta para sempre — a busca nova ficava em
 * "Revelando e-mail" sem andar.
 */
interface Consulta {
  tabela: string;
  filtros: [string, string, unknown][];
}

function criarAdmin(dados: Record<string, unknown[]>) {
  const consultas: Consulta[] = [];
  const admin = {
    rpc: async () => ({ data: true, error: null }),
    from(tabela: string) {
      const q: Consulta = { tabela, filtros: [] };
      consultas.push(q);
      const b: Record<string, unknown> = {
        select: () => b,
        update: () => b,
        eq: (c: string, v: unknown) => (q.filtros.push(["eq", c, v]), b),
        in: (c: string, v: unknown) => (q.filtros.push(["in", c, v]), b),
        lt: () => b,
        order: () => b,
        limit: () => b,
        then: (res: (v: unknown) => unknown) => {
          let linhas = dados[tabela] ?? [];
          const ids = q.filtros.find((f) => f[0] === "in" && f[1] === "id")?.[2] as string[] | undefined;
          if (ids) linhas = linhas.filter((l) => ids.includes((l as { id: string }).id));
          return Promise.resolve({ data: linhas, error: null }).then(res);
        },
      };
      return b;
    },
  };
  return { admin: admin as never, consultas };
}

describe("campanhasB2bComPendentes", () => {
  it("lê os candidatos new de buscas B2B concluídas e devolve cada busca uma vez", async () => {
    const { admin, consultas } = criarAdmin({
      prospecting_candidates: [{ campaign_id: "nova" }, { campaign_id: "nova" }, { campaign_id: "outra" }],
    });

    expect(await campanhasB2bComPendentes(admin)).toEqual(["nova", "outra"]);
    expect(consultas[0]!.filtros).toEqual(
      expect.arrayContaining([
        ["eq", "status", "new"],
        ["eq", "prospecting_campaigns.kind", "b2b"],
        ["eq", "prospecting_campaigns.search_status", "succeeded"],
      ]),
    );
  });
});

describe("processarProspeccao", () => {
  it("só busca as campanhas B2B com lead pendente, não todas as concluídas", async () => {
    const { admin, consultas } = criarAdmin({
      prospecting_campaigns: [
        { id: "antiga-1", account_id: "c1", kind: "b2b", search_status: "succeeded", search: {} },
        { id: "antiga-2", account_id: "c1", kind: "b2b", search_status: "succeeded", search: {} },
        { id: "nova", account_id: "c1", kind: "b2b", search_status: "succeeded", search: {} },
      ],
      // só a nova tem lead esperando o e-mail
      prospecting_candidates: [{ campaign_id: "nova" }],
    });

    const r = await processarProspeccao(admin);

    expect(r.contas).toBe(1);
    const campanhas = consultas.filter((q) => q.tabela === "prospecting_campaigns");
    // a única leitura de B2B é pelos ids com pendência
    expect(campanhas.map((q) => q.filtros.find((f) => f[1] === "id")?.[2]).filter(Boolean)).toEqual([["nova"]]);
    // e nenhuma consulta de campanhas traz B2B concluída só pelo status
    expect(campanhas.some((q) => q.filtros.some((f) => f[1] === "search_status" && f[2] === "succeeded"))).toBe(false);
  });

  it("sem pendência B2B, nem consulta as campanhas por id", async () => {
    const { admin, consultas } = criarAdmin({ prospecting_campaigns: [], prospecting_candidates: [] });
    await processarProspeccao(admin);
    expect(consultas.some((q) => q.filtros.some((f) => f[0] === "in" && f[1] === "id"))).toBe(false);
  });
});
