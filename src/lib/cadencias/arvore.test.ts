import { describe, expect, it } from "vitest";
import { duplicarPasso, haEmailAntes, inserirPasso, numerarPassos, passoVazio, removerPasso, todosOsPassos, validarPassos } from "./arvore";
import { passoParaExecutar, primeiroDoLado, proximoIrmao } from "./proximo-passo";
import type { Passo, PassoRamo } from "./tipos";

const email = (id: string): Passo => ({ id, tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false });
const espera = (id: string): Passo => ({ id, tipo: "espera", diasUteis: 1 });

describe("arvore", () => {
  it("insere RAMO no meio levando os seguintes para o lado nao", () => {
    const ramo = { ...(passoVazio("ramo") as PassoRamo), id: "r" };
    const r = inserirPasso([email("1"), email("2")], { lista: "raiz", indice: 1 }, ramo);
    expect(r.map((p) => p.id)).toEqual(["1", "r"]);
    expect((r[1] as PassoRamo).nao.map((p) => p.id)).toEqual(["2"]);
  });

  it("duplica com ids novos e remove recursivamente", () => {
    const ramo: PassoRamo = { id: "r", tipo: "ramo", condicao: { tipo: "abriu", vezes: 1, dentroDeDias: 1 }, sim: [email("s")], nao: [] };
    const dup = duplicarPasso([ramo], "r");
    expect(dup).toHaveLength(2);
    const ids = todosOsPassos(dup).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(todosOsPassos(removerPasso([ramo], "s")).map((p) => p.id)).toEqual(["r"]);
  });

  it("numera em ordem de leitura e detecta e-mail anterior", () => {
    const ramo: PassoRamo = { id: "r", tipo: "ramo", condicao: { tipo: "abriu", vezes: 1, dentroDeDias: 1 }, sim: [email("s")], nao: [espera("n")] };
    const arv = [email("1"), ramo];
    expect([...numerarPassos(arv).entries()]).toEqual([["1", 1], ["r", 2], ["s", 3], ["n", 4]]);
    expect(haEmailAntes(arv, "n")).toBe(true);
    expect(haEmailAntes(arv, "1")).toBe(false);
  });

  it("valida passos incompletos", () => {
    const erros = validarPassos([{ id: "1", tipo: "email", assunto: "", corpo: "", mesmaConversa: false }], { exigirFim: false });
    expect(erros.get("1")).toHaveLength(2);
  });
});

describe("proximo-passo", () => {
  const ramo: PassoRamo = { id: "r", tipo: "ramo", condicao: { tipo: "abriu", vezes: 1, dentroDeDias: 1 }, sim: [email("s1"), email("s2")], nao: [espera("n1")] };
  const arv: Passo[] = [email("a"), ramo, email("fim")];

  it("navega irmãos sem rejuntar os lados", () => {
    expect(passoParaExecutar(arv, null)?.id).toBe("a");
    expect(proximoIrmao(arv, "a")?.id).toBe("r");
    expect(proximoIrmao(arv, "s1")?.id).toBe("s2");
    expect(proximoIrmao(arv, "s2")).toBeNull();
    expect(proximoIrmao(arv, "n1")).toBeNull();
    expect(primeiroDoLado(ramo, "nao")?.id).toBe("n1");
  });

  it("id inexistente => null (worker conclui)", () => {
    expect(passoParaExecutar(arv, "x")).toBeNull();
  });
});
