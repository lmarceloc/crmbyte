import { describe, expect, it } from "vitest";
import { garantirFins, numerarPassos, validarPassos } from "./arvore";
import {
  ID_GATILHO,
  criarSolto,
  desligar,
  inserirNaFloresta,
  ligar,
  moverSolto,
  podeLigar,
  removerNaFloresta,
  validarFloresta,
  type Floresta,
} from "./montagem";
import type { Passo } from "./tipos";

const email = (id: string): Passo => ({ id, tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false });
const espera = (id: string): Passo => ({ id, tipo: "espera", diasUteis: 2 });
const tarefa = (id: string): Passo => ({ id, tipo: "tarefa", titulo: "Ligar", prazoDias: 1 });
const fim = (id: string): Passo => ({ id, tipo: "fim" });
const ramo = (id: string, sim: Passo[] = [], nao: Passo[] = []): Passo => ({
  id,
  tipo: "ramo",
  condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
  sim,
  nao,
});
const ids = (l: Passo[]): unknown[] =>
  l.map((p) => (p.tipo === "ramo" ? { [p.id]: { sim: ids(p.sim), nao: ids(p.nao) } } : p.id));

// O exemplo do usuário: E-mail → Espera → Ramo "abriu?" (Sim: Tarefa → Fim · Não: Espera → E-mail → Fim)
const base = (): Floresta => ({
  passos: [email("e1"), espera("w1"), ramo("r", [], [espera("w2"), email("e2"), fim("f2")])],
  soltos: [
    { id: "b1", x: 900, y: -300, passos: [tarefa("t")] },
    { id: "b2", x: 1200, y: -300, passos: [fim("f1")] },
  ],
});

describe("podeLigar — brilha x linha vermelha", () => {
  it("saída livre → primeira caixa de um bloco solto: aceito", () => {
    expect(podeLigar(base(), "r", "sim", "t")).toEqual({ ok: true });
    expect(podeLigar(base(), "t", "out", "f1")).toEqual({ ok: true }); // solto com solto também
  });

  it("caixa que já está no fluxo (ou no meio de um bloco) não recebe outra ligação: sem juntar caminhos", () => {
    const r = podeLigar(base(), "r", "sim", "e2");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/já tem uma entrada/);
  });

  it("saída já ocupada é recusada (para o meio, usa-se o +)", () => {
    const r = podeLigar(base(), "e1", "out", "t");
    expect(!r.ok && r.motivo).toMatch(/já está ligada/);
    expect(podeLigar(base(), "r", "nao", "t").ok).toBe(false);
  });

  it("ramo só tem Sim/Não; Fim não tem saída; gatilho só tem saída livre com o fluxo vazio", () => {
    expect(podeLigar(base(), "r", "out", "t").ok).toBe(false);
    expect(podeLigar(base(), "f2", "out", "t").ok).toBe(false);
    expect(podeLigar(base(), ID_GATILHO, "out", "t").ok).toBe(false);
    expect(podeLigar({ passos: [], soltos: base().soltos }, ID_GATILHO, "out", "t").ok).toBe(true);
  });

  it("laço e ligação na própria caixa são recusados", () => {
    const f: Floresta = { passos: [], soltos: [{ id: "b", x: 0, y: 0, passos: [tarefa("t"), espera("w")] }] };
    expect(podeLigar(f, "w", "out", "t")).toEqual({ ok: false, motivo: "Essa ligação faria um laço." });
    expect(podeLigar(f, "t", "out", "t").ok).toBe(false);
  });
});

describe("ligar / desligar", () => {
  it("monta o exemplo: Sim → Tarefa → Fim (bloco solto entra inteiro) e o fluxo fica válido", () => {
    let f = ligar(base(), "t", "out", "f1"); // Tarefa → Fim, ainda solto
    expect(f.soltos.map((s) => ids(s.passos))).toEqual([["t", "f1"]]);
    f = ligar(f, "r", "sim", "t"); // o bloco entra no lado Sim
    expect(f.soltos).toEqual([]);
    expect(ids(f.passos)).toEqual(["e1", "w1", { r: { sim: ["t", "f1"], nao: ["w2", "e2", "f2"] } }]);
    expect(validarFloresta(f).size).toBe(0);
  });

  it("encaixe recusado não muda nada", () => {
    const f = base();
    expect(ligar(f, "e1", "out", "t")).toBe(f);
  });

  it("desligar: a caixa e tudo depois dela viram um bloco solto onde ela estava", () => {
    const f = desligar(base(), "w2", 700, 200);
    expect(ids(f.passos)).toEqual(["e1", "w1", { r: { sim: [], nao: [] } }]);
    const novo = f.soltos[f.soltos.length - 1];
    expect(novo).toMatchObject({ x: 700, y: 200 });
    expect(ids(novo.passos)).toEqual(["w2", "e2", "f2"]);
    // religa em outro lugar
    const g = ligar(f, "r", "sim", "w2");
    expect(ids(g.passos)).toEqual(["e1", "w1", { r: { sim: ["w2", "e2", "f2"], nao: [] } }]);
  });

  it("desligar o primeiro passo solta o fluxo inteiro; o começo de um bloco não tem o que desligar", () => {
    const f = desligar(base(), "e1", 0, 0);
    expect(f.passos).toEqual([]);
    expect(desligar(base(), "t", 1, 1)).toEqual(base());
  });

  it("criar, mover e remover caixas soltas; bloco vazio some", () => {
    let f = criarSolto({ passos: [], soltos: [] }, fim("x"), 10, 20);
    expect(f.soltos[0]).toMatchObject({ x: 10, y: 20 });
    f = moverSolto(f, f.soltos[0].id, 50, 60);
    expect(f.soltos[0]).toMatchObject({ x: 50, y: 60 });
    expect(removerNaFloresta(f, "x").soltos).toEqual([]);
  });

  it("+ de uma ligação dentro de bloco solto insere ali", () => {
    const f: Floresta = { passos: [], soltos: [{ id: "b", x: 0, y: 0, passos: [tarefa("t"), fim("f")] }] };
    const g = inserirNaFloresta(f, { lista: "solto:b", indice: 1 }, espera("w"));
    expect(ids(g.soltos[0].passos)).toEqual(["t", "w", "f"]);
  });
});

describe("caixa Fim — validação e cadências antigas", () => {
  it("caminho sem Fim barra a ativação; lado vazio do ramo também", () => {
    const erros = validarPassos([email("e1"), ramo("r", [tarefa("t")], [])]);
    expect(erros.get("t")?.map((e) => e.mensagem)).toContain("Este caminho precisa terminar em uma caixa Fim.");
    expect(erros.get("r")?.map((e) => e.mensagem)).toContain("O lado Não precisa terminar em uma caixa Fim.");
  });

  it("Fim no meio do caminho e passo depois de ramo são erros", () => {
    expect(validarPassos([email("e1"), fim("f"), espera("w")]).get("f")?.[0].mensagem).toMatch(/última do caminho/);
    expect(validarPassos([ramo("r", [fim("a")], [fim("b")]), fim("c")]).get("r")?.[0].mensagem).toMatch(/depois de um ramo/);
  });

  it("ramo com Fim direto nos dois lados não faz nada: erro; Sim → Fim e Não com passos é válido", () => {
    expect(validarPassos([email("e"), ramo("r", [fim("a")], [fim("b")])]).get("r")?.[0].mensagem).toMatch(/pelo menos um/);
    expect(validarPassos([email("e"), ramo("r", [fim("a")], [email("x"), fim("b")])]).size).toBe(0);
  });

  it("caixas soltas só validam os campos (sem exigir Fim)", () => {
    const f: Floresta = { passos: [email("e"), fim("f")], soltos: [{ id: "b", x: 0, y: 0, passos: [tarefa("t")] }] };
    expect(validarFloresta(f).size).toBe(0);
    f.soltos[0].passos = [{ id: "t", tipo: "tarefa", titulo: "", prazoDias: 1 }];
    expect(validarFloresta(f).get("t")?.[0].mensagem).toBe("A tarefa precisa de título.");
  });

  it("cadência antiga ganha caixa Fim em cada caminho aberto e fica igual ao que era", () => {
    const antiga = [email("e1"), ramo("r", [tarefa("t")], [])];
    const { passos, mudou } = garantirFins(antiga);
    expect(mudou).toBe(true);
    expect(validarPassos(passos).size).toBe(0);
    const r = passos[1] as Extract<Passo, { tipo: "ramo" }>;
    expect(r.sim.map((p) => p.tipo)).toEqual(["tarefa", "fim"]);
    expect(r.nao.map((p) => p.tipo)).toEqual(["fim"]);
    // já fechada: nada muda (mesma referência); fluxo vazio continua vazio
    expect(garantirFins(passos)).toEqual({ passos, mudou: false });
    expect(garantirFins([])).toEqual({ passos: [], mudou: false });
  });

  it("a caixa Fim não leva número", () => {
    expect([...numerarPassos([email("e"), fim("f")])]).toEqual([["e", 1]]);
  });
});
