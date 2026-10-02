import { describe, expect, it } from "vitest";
import { montarContatoDaEmpresa, vinculoDoContato } from "./contato-da-empresa";

const empresa = { id: "emp-1", name: "Sylvamo" };
const base = { nome: "  Henrique Godoy  ", empresa, accountId: "acc-1", userId: "usr-1" };

describe("montarContatoDaEmpresa", () => {
  it("cria o contato já da empresa, com nome e cargo aparados", () => {
    expect(
      montarContatoDaEmpresa({ ...base, cargo: " Gerente de logística ", email: " h@sylvamo.com ", telefone: " 11 99999-0000 " }),
    ).toEqual({
      ok: true,
      contato: {
        account_id: "acc-1",
        user_id: "usr-1",
        name: "Henrique Godoy",
        email: "h@sylvamo.com",
        phone: "11 99999-0000",
        job_title: "Gerente de logística",
        company: "Sylvamo",
        company_id: "emp-1",
      },
    });
  });

  it("só o nome é obrigatório: e-mail, telefone e cargo vazios viram null / vazio", () => {
    const r = montarContatoDaEmpresa(base);
    expect(r.ok && r.contato).toMatchObject({ email: null, phone: "", job_title: null, company_id: "emp-1" });
  });

  it("recusa nome vazio ou só espaços", () => {
    expect(montarContatoDaEmpresa({ ...base, nome: "   " })).toEqual({ ok: false, erro: "Dê um nome ao contato." });
  });

  it("recusa e-mail que não parece e-mail, mas aceita o campo vazio", () => {
    expect(montarContatoDaEmpresa({ ...base, email: "sem-arroba" })).toEqual({ ok: false, erro: "E-mail inválido." });
    expect(montarContatoDaEmpresa({ ...base, email: "a@b" }).ok).toBe(false);
    expect(montarContatoDaEmpresa({ ...base, email: "" }).ok).toBe(true);
  });
});

describe("vinculoDoContato", () => {
  it("vincula quem não tem empresa e preenche o texto legado só se estiver vazio", () => {
    expect(vinculoDoContato({ company_id: null, company: null }, empresa)).toEqual({
      ok: true,
      campos: { company_id: "emp-1", company: "Sylvamo" },
    });
    expect(vinculoDoContato({ company_id: null, company: "  " }, empresa)).toEqual({
      ok: true,
      campos: { company_id: "emp-1", company: "Sylvamo" },
    });
  });

  it("não sobrescreve o texto de empresa que a pessoa já tinha escrito", () => {
    expect(vinculoDoContato({ company_id: null, company: "Sylvamo Brasil" }, empresa)).toEqual({
      ok: true,
      campos: { company_id: "emp-1" },
    });
  });

  it("nunca tira o contato de outra empresa", () => {
    expect(vinculoDoContato({ company_id: "outra" }, empresa)).toEqual({
      ok: false,
      erro: "Este contato já pertence a outra empresa.",
    });
    expect(vinculoDoContato({ company_id: "emp-1" }, empresa)).toEqual({
      ok: false,
      erro: "Este contato já é desta empresa.",
    });
  });
});
