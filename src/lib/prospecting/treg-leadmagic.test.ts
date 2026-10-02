import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarPessoas, extractPeopleRows, normalizeLead } from "./treg";

afterEach(() => vi.unstubAllGlobals());

// Resposta real, colada do log da Treg: UM objeto plano de pessoa, sem `people[]`,
// sem o cargo (que foi a pergunta) e com o site da empresa no lugar do domínio.
const roleFinder = {
  name: "Henrique Andrade Godoy",
  profile_url: "https://www.linkedin.com/in/henrique-andrade-godoy-73650222",
  first_name: "Henrique",
  last_name: "Godoy",
  message: "Role Found",
  credits_consumed: 2,
  company_name: "Sylvamo",
  company_website: "sylvamo.com",
};

describe("treg.people.search servido pelo leadmagic (role-finder)", () => {
  it("não perde a pessoa quando o provedor não embrulha em people[]", () => {
    expect(extractPeopleRows(roleFinder)).toEqual([roleFinder]);
    // Os formatos antigos continuam valendo.
    expect(extractPeopleRows({ people: [{ id: "a" }, { id: "b" }] })).toEqual([{ id: "a" }, { id: "b" }]);
    expect(extractPeopleRows([{ id: "a" }, "lixo", null])).toEqual([{ id: "a" }]);
    // `people` presente e vazio é "nenhum resultado", não uma pessoa chamada "people".
    expect(extractPeopleRows({ people: [] })).toEqual([]);
    expect(extractPeopleRows(null)).toEqual([]);
    expect(extractPeopleRows("Role Found")).toEqual([]);
  });

  it("normaliza o lead com nome completo, LinkedIn, empresa e domínio — e o cargo da busca", () => {
    expect(normalizeLead(roleFinder, { title: "Gerente de logística", companyDomain: "www.sylvamo.com" })).toEqual({
      key: "Henrique Andrade Godoy:sylvamo.com",
      fullName: "Henrique Andrade Godoy",
      title: "Gerente de logística",
      companyName: "Sylvamo",
      companyDomain: "sylvamo.com",
      location: null,
      linkedin: "https://www.linkedin.com/in/henrique-andrade-godoy-73650222",
      email: null,
      emailVerified: false,
    });
  });

  it("o domínio da busca preenche o que a resposta não trouxe (sem o www), e o do provedor vence", () => {
    const semSite = { name: "Ana Lima", profile_url: "https://www.linkedin.com/in/ana" };
    expect(normalizeLead(semSite, { companyDomain: "www.x.com.br" })?.companyDomain).toBe("x.com.br");
    expect(
      normalizeLead({ ...semSite, company_website: "https://www.y.com/sobre" }, { companyDomain: "x.com.br" })?.companyDomain,
    ).toBe("y.com");
    expect(normalizeLead(semSite)?.companyDomain).toBeNull();
  });

  it("o cargo que o provedor devolve vence o cargo pesquisado", () => {
    expect(
      normalizeLead({ ...roleFinder, job_title: "Head de Supply Chain" }, { title: "Gerente de logística" })?.title,
    ).toBe("Head de Supply Chain");
  });

  it("'Role Not Found' (sem pessoa) não vira lead", () => {
    const rows = extractPeopleRows({ message: "Role Not Found", credits_consumed: 0 });
    expect(rows).toHaveLength(1);
    expect(normalizeLead(rows[0], { title: "Gerente de logística" })).toBeNull();
  });

  it("buscarPessoas devolve o lead e o custo quando a Treg serve o leadmagic", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ output: roleFinder, _treg: { charged_micro: 20000 } })));
    vi.stubGlobal("fetch", fetch);
    const r = await buscarPessoas(
      "chave-teste",
      { limit: 20, title: "Gerente de logística", company_domain: "www.sylvamo.com" },
      1,
    );
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      title: "Gerente de logística",
      company_domain: "www.sylvamo.com",
    });
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({
      fullName: "Henrique Andrade Godoy",
      title: "Gerente de logística",
      companyName: "Sylvamo",
      companyDomain: "sylvamo.com",
    });
    expect(r.custoUsd).toBeCloseTo(0.02);
  });
});
