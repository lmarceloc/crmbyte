import { describe, expect, it } from "vitest";
import { inserirPasso, passoVazio } from "./arvore";
import {
  ALTURA,
  ESPACO_X,
  ESPACO_Y,
  ID_GATILHO,
  LARGURA_DO_NO,
  alturaDaLista,
  caminhoDaLigacao,
  caminhoDoRaio,
  montarGrafo,
} from "./grafo";
import type { Passo } from "./tipos";

const email = (id: string): Passo => ({ id, tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false });
const espera = (id: string): Passo => ({ id, tipo: "espera", diasUteis: 2 });
const fim = (id: string): Passo => ({ id, tipo: "fim" });
const ramo = (id: string, sim: Passo[], nao: Passo[]): Passo => ({
  id,
  tipo: "ramo",
  condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
  sim,
  nao,
});
const COL = LARGURA_DO_NO + ESPACO_X;

describe("montarGrafo", () => {
  it("cadência vazia: só o gatilho, com a saída livre (sem fim automático)", () => {
    const { nos, ligacoes } = montarGrafo([]);
    expect(nos.map((n) => n.id)).toEqual([ID_GATILHO]);
    expect(ligacoes).toEqual([]);
  });

  it("passos em linha, da esquerda para a direita; a caixa Fim é um passo como os outros", () => {
    const { nos, ligacoes } = montarGrafo([email("e1"), espera("w1"), fim("f")]);
    expect(nos.map((n) => [n.id, n.tipo, n.x])).toEqual([
      [ID_GATILHO, "gatilho", 0],
      ["e1", "passo", COL],
      ["w1", "passo", 2 * COL],
      ["f", "fim", 3 * COL],
    ]);
    for (const n of nos) expect(n.y + n.altura / 2).toBe(0);
    expect(nos.find((n) => n.id === "f")!.altura).toBe(ALTURA.fim);
    expect(ligacoes.map((l) => [l.origem, l.destino, l.ponto.indice])).toEqual([
      [ID_GATILHO, "e1", 0],
      ["e1", "w1", 1],
      ["w1", "f", 2],
    ]);
  });

  it("caminho aberto termina na última caixa, sem ligação nem fim", () => {
    const { nos, ligacoes } = montarGrafo([email("e1")]);
    expect(nos.map((n) => n.id)).toEqual([ID_GATILHO, "e1"]);
    expect(ligacoes.map((l) => l.destino)).toEqual(["e1"]);
  });

  it("ramo abre Sim em cima e Não embaixo; lado vazio não ganha caixa", () => {
    const { nos, ligacoes } = montarGrafo([email("e1"), ramo("r", [email("s1"), fim("fs")], [])]);
    const no = (id: string) => nos.find((n) => n.id === id)!;
    expect(no("s1").x).toBe(3 * COL);
    expect(no("s1").y + no("s1").altura / 2).toBeLessThan(0);
    expect(nos.some((n) => n.id.startsWith("__fim"))).toBe(false);
    expect(ligacoes.find((l) => l.destino === "s1")).toMatchObject({ origem: "r", saida: "sim", ponto: { lista: "r:sim", indice: 0 } });
    expect(ligacoes.find((l) => l.destino === "fs")).toMatchObject({ origem: "s1", ponto: { lista: "r:sim", indice: 1 } });
    expect(ligacoes.some((l) => l.saida === "nao")).toBe(false);
  });

  it("o ponto de cada '+' insere exatamente entre os dois cartões ligados", () => {
    const passos = [email("e1"), espera("w1")];
    const { ligacoes } = montarGrafo(passos);
    const meio = ligacoes.find((l) => l.origem === "e1")!;
    const novo = passoVazio("tarefa");
    expect(inserirPasso(passos, meio.ponto, novo).map((p) => p.id)).toEqual(["e1", novo.id, "w1"]);
  });

  it("bloco solto fica onde foi deixado, com as próprias ligações e sem ligação de entrada", () => {
    const { nos, ligacoes } = montarGrafo([email("e1")], [{ id: "b", x: 500, y: 300, passos: [espera("w"), fim("f")] }]);
    const w = nos.find((n) => n.id === "w")!;
    expect(w).toMatchObject({ x: 500, y: 300, solto: "b" });
    expect(nos.find((n) => n.id === "f")).toMatchObject({ x: 500 + COL, solto: "b" });
    expect(ligacoes.find((l) => l.destino === "w")).toBeUndefined();
    expect(ligacoes.find((l) => l.destino === "f")).toMatchObject({ origem: "w", ponto: { lista: "solto:b", indice: 1 } });
    expect(nos.find((n) => n.id === "e1")!.solto).toBeUndefined();
  });

  it("ramos aninhados ganham altura suficiente para não encavalar", () => {
    const interno = ramo("r2", [email("a")], [email("b")]);
    const passos = [ramo("r1", [interno], [email("c")])];
    expect(alturaDaLista([interno])).toBe(2 * ALTURA.passo + ESPACO_Y);
    expect(alturaDaLista(passos)).toBe(2 * ALTURA.passo + ESPACO_Y + ESPACO_Y + ALTURA.passo);
    const { nos } = montarGrafo(passos);
    const coluna = nos.filter((n) => n.x === nos.find((m) => m.id === "a")!.x).sort((p, q) => p.y - q.y);
    for (let i = 1; i < coluna.length; i++) expect(coluna[i].y).toBeGreaterThanOrEqual(coluna[i - 1].y + coluna[i - 1].altura);
  });
});

describe("caminhos SVG", () => {
  it("a ligação usa alças horizontais de 48% (mínimo 50)", () => {
    expect(caminhoDaLigacao({ x: 0, y: 0 }, { x: 200, y: 40 })).toBe("M 0 0 C 96 0, 104 40, 200 40");
    expect(caminhoDaLigacao({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe("M 0 0 C 50 0, -30 0, 20 0");
  });

  it("o raio começa e termina nos pontos dados e alterna para os dois lados", () => {
    const d = caminhoDoRaio({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("L 100 0")).toBe(true);
    const ys = [...d.matchAll(/L [\d.-]+ ([\d.-]+)/g)].map((m) => Number(m[1])).slice(0, 4);
    expect(ys).toEqual([-7, 7, -7, 7]);
    const curto = caminhoDoRaio({ x: 0, y: 0 }, { x: 6, y: 0 });
    expect(Math.max(...[...curto.matchAll(/L [\d.-]+ ([\d.-]+)/g)].map((m) => Math.abs(Number(m[1]))))).toBe(1);
  });
});

describe("pontoLivre", () => {
  it("fica no alvo quando está livre e foge dos cartões quando não está", async () => {
    const { pontoLivre } = await import("./grafo");
    const tam = { largura: 240, altura: 164 };
    expect(pontoLivre([], { x: 10, y: 10 }, tam)).toEqual({ x: 10, y: 10 });
    const ocupado = [{ x: 0, y: 0, largura: 240, altura: 164 }];
    const p = pontoLivre(ocupado, { x: 0, y: 0 }, tam);
    const colide = p.x < 240 + 24 && p.x + 240 + 24 > 0 && p.y < 164 + 24 && p.y + 164 + 24 > 0;
    expect(colide).toBe(false);
    // perto do alvo: no máximo algumas casas de distância
    expect(Math.hypot(p.x, p.y)).toBeLessThan(400);
  });
});
