import { describe, expect, it } from "vitest";
import { inserirPasso, passoVazio } from "./arvore";
import {
  ALTURA,
  ESPACO_X,
  ESPACO_Y,
  ID_FIM,
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
const ramo = (id: string, sim: Passo[], nao: Passo[]): Passo => ({
  id,
  tipo: "ramo",
  condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
  sim,
  nao,
});
const COL = LARGURA_DO_NO + ESPACO_X;

describe("montarGrafo", () => {
  it("cadência vazia: gatilho ligado ao fim, com o '+' inserindo no começo", () => {
    const { nos, ligacoes } = montarGrafo([]);
    expect(nos.map((n) => n.id)).toEqual([ID_GATILHO, ID_FIM]);
    expect(ligacoes).toEqual([
      { id: `${ID_GATILHO}:out->${ID_FIM}`, origem: ID_GATILHO, saida: "out", destino: ID_FIM, ponto: { lista: "raiz", indice: 0 } },
    ]);
  });

  it("passos em linha, da esquerda para a direita, cada ligação com o seu ponto de inserção", () => {
    const { nos, ligacoes } = montarGrafo([email("e1"), espera("w1")]);
    expect(nos.map((n) => [n.id, n.x])).toEqual([
      [ID_GATILHO, 0],
      ["e1", COL],
      ["w1", 2 * COL],
      [ID_FIM, 3 * COL],
    ]);
    // todos centrados na mesma linha
    for (const n of nos) expect(n.y + n.altura / 2).toBe(0);
    expect(ligacoes.map((l) => [l.origem, l.destino, l.ponto.indice])).toEqual([
      [ID_GATILHO, "e1", 0],
      ["e1", "w1", 1],
      ["w1", ID_FIM, 2],
    ]);
  });

  it("ramo abre Sim em cima e Não embaixo, cada lado com o próprio fim e pontos de inserção", () => {
    const passos = [email("e1"), ramo("r", [email("s1")], [])];
    const { nos, ligacoes } = montarGrafo(passos);
    const no = (id: string) => nos.find((n) => n.id === id)!;

    expect(nos.some((n) => n.id === ID_FIM)).toBe(false); // o ramo termina o caminho principal
    expect(no("s1").x).toBe(3 * COL);
    expect(no("s1").y + no("s1").altura / 2).toBeLessThan(0);
    const fimNao = no("__fim:r:nao");
    expect(fimNao.y + fimNao.altura / 2).toBeGreaterThan(0);
    // os dois caminhos não se sobrepõem
    expect(no("s1").y + no("s1").altura + ESPACO_Y).toBeLessThanOrEqual(fimNao.y + 0.001);

    expect(ligacoes.find((l) => l.destino === "s1")).toMatchObject({ origem: "r", saida: "sim", ponto: { lista: "r:sim", indice: 0 } });
    expect(ligacoes.find((l) => l.destino === "__fim:r:sim")).toMatchObject({ origem: "s1", ponto: { lista: "r:sim", indice: 1 } });
    expect(ligacoes.find((l) => l.destino === "__fim:r:nao")).toMatchObject({ origem: "r", saida: "nao", ponto: { lista: "r:nao", indice: 0 } });
  });

  it("o ponto de cada '+' insere exatamente entre os dois cartões ligados", () => {
    const passos = [email("e1"), espera("w1")];
    const { ligacoes } = montarGrafo(passos);
    const meio = ligacoes.find((l) => l.origem === "e1")!;
    const novo = passoVazio("tarefa");
    expect(inserirPasso(passos, meio.ponto, novo).map((p) => p.id)).toEqual(["e1", novo.id, "w1"]);
  });

  it("ramos aninhados ganham altura suficiente para não encavalar", () => {
    const interno = ramo("r2", [email("a")], [email("b")]);
    const passos = [ramo("r1", [interno], [email("c")])];
    // interno = Sim (a) + Não (b); externo = interno + Não (c)
    expect(alturaDaLista([interno])).toBe(2 * ALTURA.passo + ESPACO_Y);
    expect(alturaDaLista(passos)).toBe(2 * ALTURA.passo + ESPACO_Y + ESPACO_Y + ALTURA.passo);
    const { nos } = montarGrafo(passos);
    const caixas = nos.filter((n) => n.x === nos.find((m) => m.id === "a")!.x).sort((p, q) => p.y - q.y);
    for (let i = 1; i < caixas.length; i++) expect(caixas[i].y).toBeGreaterThanOrEqual(caixas[i - 1].y + caixas[i - 1].altura);
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
    // em distância curta a amplitude encolhe
    const curto = caminhoDoRaio({ x: 0, y: 0 }, { x: 6, y: 0 });
    expect(Math.max(...[...curto.matchAll(/L [\d.-]+ ([\d.-]+)/g)].map((m) => Math.abs(Number(m[1]))))).toBe(1);
  });
});
