import { describe, expect, it } from "vitest";
import { camposParaCompletar, pedidoSchema, resumir, validarItem } from "./importar-contatos";
import { chaveDoPedido, gerarChave, hashDaChave } from "./api-keys";

const vazio = { name: null, email: null, phone: null, job_title: null, linkedin_url: null, company: null, company_id: null };

describe("validarItem", () => {
  it("normaliza: apara, e-mail minúsculo, vazios viram null", () => {
    const r = validarItem({ name: " Ana ", email: " ANA@X.COM ", phone: "", empresa: { name: " XYZ ", website: "" } });
    expect(r).toEqual({
      ok: true,
      contato: {
        name: "Ana",
        email: "ana@x.com",
        phone: null,
        job_title: null,
        linkedin_url: null,
        empresa: { name: "XYZ", website: null, linkedin_url: null },
      },
    });
  });

  it("exige nome e ao menos e-mail, telefone ou LinkedIn", () => {
    expect(validarItem({ name: "", email: "a@x.com" }).ok).toBe(false);
    expect(validarItem({ name: "Ana" }).ok).toBe(false);
    expect(validarItem({ name: "Ana", phone: "-- --" }).ok).toBe(false);
    expect(validarItem({ name: "Ana", phone: "+55 11 99999-0000" }).ok).toBe(true);
    expect(validarItem({ name: "Ana", linkedin_url: "https://linkedin.com/in/ana" }).ok).toBe(true);
  });

  it("recusa e-mail inválido e campo desconhecido, com mensagem", () => {
    const r = validarItem({ name: "Ana", email: "sem-arroba" });
    expect(r.ok === false && r.erro).toContain("E-mail inválido.");
    expect(validarItem({ name: "Ana", email: "a@x.com", account_id: "x" }).ok).toBe(false);
  });
});

describe("pedidoSchema", () => {
  it("source padrão 'api' e limite de 100 contatos", () => {
    expect(pedidoSchema.parse({ contatos: [{}] }).source).toBe("api");
    expect(pedidoSchema.safeParse({ contatos: [] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ contatos: Array(101).fill({}) }).success).toBe(false);
  });
});

describe("camposParaCompletar", () => {
  const novo = { name: "Ana", email: "a@x.com", phone: "11999", job_title: "CEO", linkedin_url: "li", empresa: null };

  it("completa só o que está vazio", () => {
    const atual = { ...vazio, name: "Ana Souza", email: "a@x.com", job_title: "Diretora" };
    expect(camposParaCompletar(atual, novo, { id: "emp-1", nome: "XYZ" })).toEqual({
      phone: "11999",
      linkedin_url: "li",
      company_id: "emp-1",
      company: "XYZ",
    });
  });

  it("não troca a empresa de quem já tem uma, nem o texto legado", () => {
    expect(camposParaCompletar({ ...vazio, name: "Ana", company_id: "outra" }, novo, { id: "emp-1", nome: "XYZ" })).not.toHaveProperty(
      "company_id",
    );
    expect(camposParaCompletar({ ...vazio, name: "Ana", company: "Antiga" }, novo, { id: "emp-1", nome: "XYZ" })).toMatchObject({
      company_id: "emp-1",
    });
    expect(camposParaCompletar({ ...vazio, name: "Ana", company: "Antiga" }, novo, { id: "emp-1", nome: "XYZ" })).not.toHaveProperty(
      "company",
    );
  });
});

describe("resumir", () => {
  it("conta por status", () => {
    expect(
      resumir([
        { indice: 0, status: "criado" },
        { indice: 1, status: "criado" },
        { indice: 2, status: "invalido" },
      ]),
    ).toEqual({ criado: 2, atualizado: 0, existente: 0, invalido: 1, erro: 0 });
  });
});

describe("chaves de API", () => {
  it("gera chaves únicas com prefixo, hash estável", () => {
    const a = gerarChave();
    expect(a).toMatch(/^wacrm_[\w-]{32}$/);
    expect(a).not.toBe(gerarChave());
    expect(hashDaChave(a)).toBe(hashDaChave(a));
    expect(hashDaChave(a)).toHaveLength(64);
  });

  it("lê Bearer ou X-Api-Key; ignora o que não é chave do CRM", () => {
    expect(chaveDoPedido(new Headers({ authorization: "Bearer wacrm_abc" }))).toBe("wacrm_abc");
    expect(chaveDoPedido(new Headers({ "x-api-key": "wacrm_abc" }))).toBe("wacrm_abc");
    expect(chaveDoPedido(new Headers({ authorization: "Bearer outra" }))).toBeNull();
    expect(chaveDoPedido(new Headers())).toBeNull();
  });
});
