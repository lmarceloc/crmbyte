// Montagem manual do fluxo no canvas: caixas soltas, ligar uma saída na
// entrada de uma caixa e desfazer a ligação. Funções puras e imutáveis.
//
// O fluxo continua sendo uma árvore (o worker não muda): cada saída leva a UMA
// caixa, não há rejunção nem laço. Por isso a regra de encaixe é simples: só se
// liga uma saída LIVRE na primeira caixa de um bloco SOLTO (ainda sem entrada).
import {
  atualizarPasso,
  duplicarPasso,
  inserirPasso,
  novoId,
  removerPasso,
  todosOsPassos,
  validarPassos,
  type PontoDeInsercao,
  type Problema,
} from "./arvore";
import { ID_GATILHO, type SaidaDoNo } from "./grafo";
import type { BlocoSolto, Passo } from "./tipos";

export { ID_GATILHO };

/** O fluxo (ligado ao gatilho) e as caixas soltas no canvas. */
export interface Floresta {
  passos: Passo[];
  soltos: BlocoSolto[];
}

export type Saida = SaidaDoNo;
const FLUXO = "fluxo";
const chaveDoSolto = (id: string) => `solto:${id}`;

interface Local {
  /** "fluxo" ou o id do bloco solto. */
  bloco: string;
  /** Lista onde está: "raiz", "solto:<id>" ou "<ramoId>:sim|nao". */
  chave: string;
  indice: number;
  lista: Passo[];
}

function acharEmLista(lista: Passo[], id: string, chave: string, bloco: string): Local | null {
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    if (p.id === id) return { bloco, chave, indice: i, lista };
    if (p.tipo === "ramo") {
      const r = acharEmLista(p.sim, id, `${p.id}:sim`, bloco) ?? acharEmLista(p.nao, id, `${p.id}:nao`, bloco);
      if (r) return r;
    }
  }
  return null;
}

export function localizar(f: Floresta, id: string): Local | null {
  const noFluxo = acharEmLista(f.passos, id, "raiz", FLUXO);
  if (noFluxo) return noFluxo;
  for (const s of f.soltos) {
    const r = acharEmLista(s.passos, id, chaveDoSolto(s.id), s.id);
    if (r) return r;
  }
  return null;
}

export function encontrarNaFloresta(f: Floresta, id: string): Passo | null {
  const l = localizar(f, id);
  return l ? l.lista[l.indice] : null;
}

/** Bloco solto de um passo (null se o passo está no fluxo). */
export function blocoDoPasso(f: Floresta, id: string): string | null {
  const l = localizar(f, id);
  return l && l.bloco !== FLUXO ? l.bloco : null;
}

/** A lista que uma saída alimenta e se ela está livre (nada ligado depois). */
export function listaDaSaida(f: Floresta, origem: string, saida: Saida): { bloco: string; chave: string; livre: boolean } | null {
  if (origem === ID_GATILHO) return saida === "out" ? { bloco: FLUXO, chave: "raiz", livre: f.passos.length === 0 } : null;
  const l = localizar(f, origem);
  if (!l) return null;
  const p = l.lista[l.indice];
  if (saida === "out") {
    if (p.tipo === "ramo" || p.tipo === "fim") return null;
    return { bloco: l.bloco, chave: l.chave, livre: l.indice === l.lista.length - 1 };
  }
  if (p.tipo !== "ramo") return null;
  return { bloco: l.bloco, chave: `${p.id}:${saida}`, livre: p[saida].length === 0 };
}

export type ResultadoDoEncaixe = { ok: true } | { ok: false; motivo: string };

/** O encaixe "saída → entrada" é aceito? (define brilho x linha vermelha no canvas) */
export function podeLigar(f: Floresta, origem: string, saida: Saida, destino: string): ResultadoDoEncaixe {
  if (origem === destino) return { ok: false, motivo: "Uma caixa não pode ligar nela mesma." };
  const de = listaDaSaida(f, origem, saida);
  if (!de) return { ok: false, motivo: "Essa caixa não tem essa saída." };
  const bloco = f.soltos.find((s) => s.passos[0]?.id === destino);
  if (!bloco) {
    return {
      ok: false,
      motivo: localizar(f, destino)
        ? "Essa caixa já tem uma entrada: cada caixa recebe uma ligação só (sem juntar caminhos)."
        : "Caixa não encontrada.",
    };
  }
  if (!de.livre) return { ok: false, motivo: "Essa saída já está ligada. Para pôr uma caixa no meio, use o “+” da ligação." };
  if (de.bloco === bloco.id) return { ok: false, motivo: "Essa ligação faria um laço." };
  return { ok: true };
}

function anexar(lista: Passo[], chave: string, chaveDaRaiz: string, novos: Passo[]): Passo[] {
  if (chave === chaveDaRaiz) return [...lista, ...novos];
  const [ramoId, lado] = chave.split(":") as [string, "sim" | "nao"];
  return lista.map((p) => {
    if (p.tipo !== "ramo") return p;
    if (p.id === ramoId) return { ...p, [lado]: [...p[lado], ...novos] };
    return { ...p, sim: anexar(p.sim, chave, "", novos), nao: anexar(p.nao, chave, "", novos) };
  });
}

/** Liga a saída na primeira caixa do bloco solto: o bloco inteiro entra ali. Encaixe recusado = nada muda. */
export function ligar(f: Floresta, origem: string, saida: Saida, destino: string): Floresta {
  if (!podeLigar(f, origem, saida, destino).ok) return f;
  const de = listaDaSaida(f, origem, saida)!;
  const bloco = f.soltos.find((s) => s.passos[0]?.id === destino)!;
  const restantes = f.soltos.filter((s) => s.id !== bloco.id);
  if (de.bloco === FLUXO) return { passos: anexar(f.passos, de.chave, "raiz", bloco.passos), soltos: restantes };
  return {
    passos: f.passos,
    soltos: restantes.map((s) =>
      s.id === de.bloco ? { ...s, passos: anexar(s.passos, de.chave, chaveDoSolto(s.id), bloco.passos) } : s,
    ),
  };
}

function cortar(lista: Passo[], chave: string, chaveDaRaiz: string, indice: number): Passo[] {
  if (chave === chaveDaRaiz) return lista.slice(0, indice);
  const [ramoId, lado] = chave.split(":") as [string, "sim" | "nao"];
  return lista.map((p) => {
    if (p.tipo !== "ramo") return p;
    if (p.id === ramoId) return { ...p, [lado]: p[lado].slice(0, indice) };
    return { ...p, sim: cortar(p.sim, chave, "", indice), nao: cortar(p.nao, chave, "", indice) };
  });
}

/**
 * Desfaz a ligação que chega em `destino`: ele e tudo o que vinha depois dele
 * na mesma sequência viram um bloco solto em (x, y).
 */
export function desligar(f: Floresta, destino: string, x: number, y: number): Floresta {
  const l = localizar(f, destino);
  if (!l) return f;
  if (l.bloco !== FLUXO && l.chave === chaveDoSolto(l.bloco) && l.indice === 0) return f; // já é o começo de um bloco
  const separados = l.lista.slice(l.indice);
  const novo: BlocoSolto = { id: novoId(), x, y, passos: separados };
  if (l.bloco === FLUXO) return { passos: cortar(f.passos, l.chave, "raiz", l.indice), soltos: [...f.soltos, novo] };
  return {
    passos: f.passos,
    soltos: [
      ...f.soltos.map((s) => (s.id === l.bloco ? { ...s, passos: cortar(s.passos, l.chave, chaveDoSolto(s.id), l.indice) } : s)),
      novo,
    ],
  };
}

export function criarSolto(f: Floresta, passo: Passo, x: number, y: number): Floresta {
  return { ...f, soltos: [...f.soltos, { id: novoId(), x, y, passos: [passo] }] };
}

export function moverSolto(f: Floresta, id: string, x: number, y: number): Floresta {
  return { ...f, soltos: f.soltos.map((s) => (s.id === id ? { ...s, x, y } : s)) };
}

const emTudo = (f: Floresta, fn: (lista: Passo[]) => Passo[]): Floresta => ({
  passos: fn(f.passos),
  soltos: f.soltos.map((s) => ({ ...s, passos: fn(s.passos) })).filter((s) => s.passos.length > 0),
});

export const removerNaFloresta = (f: Floresta, id: string) => emTudo(f, (l) => removerPasso(l, id));
export const atualizarNaFloresta = (f: Floresta, id: string, mudanca: (p: Passo) => Passo) =>
  emTudo(f, (l) => atualizarPasso(l, id, mudanca));
export const duplicarNaFloresta = (f: Floresta, id: string) => emTudo(f, (l) => duplicarPasso(l, id));

/** Insere pelo "+" de uma ligação (ponto relativo à lista onde a ligação está). */
export function inserirNaFloresta(f: Floresta, ponto: PontoDeInsercao, novo: Passo): Floresta {
  if (ponto.lista === "raiz") return { ...f, passos: inserirPasso(f.passos, ponto, novo) };
  if (ponto.lista.startsWith("solto:")) {
    const id = ponto.lista.slice("solto:".length);
    return {
      ...f,
      soltos: f.soltos.map((s) => (s.id === id ? { ...s, passos: inserirPasso(s.passos, { ...ponto, lista: "raiz" }, novo) } : s)),
    };
  }
  return emTudo(f, (l) => inserirPasso(l, ponto, novo)); // lado de um ramo: só a árvore que tem o ramo muda
}

/** Problemas por passo: o fluxo exige caixa Fim em todo caminho; soltos só validam os campos. */
export function validarFloresta(f: Floresta): Map<string, Problema[]> {
  const erros = validarPassos(f.passos);
  for (const s of f.soltos) {
    for (const [id, ps] of validarPassos(s.passos, { exigirFim: false })) erros.set(id, ps);
  }
  return erros;
}

export const todosNaFloresta = (f: Floresta): Passo[] => [
  ...todosOsPassos(f.passos),
  ...f.soltos.flatMap((s) => todosOsPassos(s.passos)),
];
