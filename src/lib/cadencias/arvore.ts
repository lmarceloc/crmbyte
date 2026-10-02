// Operações puras e imutáveis sobre a árvore de passos.
// Ramo = { sim: Passo[], nao: Passo[] }; os lados NUNCA se rejuntam.
import type { Passo, PassoRamo, TipoDePasso } from "./tipos";

export type PontoDeInsercao = {
  /** "raiz" ou "<ramoId>:sim" | "<ramoId>:nao" */
  lista: string;
  indice: number;
};

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function passoVazio(tipo: TipoDePasso): Passo {
  const id = novoId();
  switch (tipo) {
    case "email":
      return { id, tipo, assunto: "", corpo: "", mesmaConversa: false };
    case "espera":
      return { id, tipo, diasUteis: 2 };
    case "ramo":
      return {
        id,
        tipo,
        condicao: { tipo: "abriu", vezes: 2, dentroDeDias: 3 },
        sim: [],
        nao: [],
      };
    case "whatsapp":
      return { id, tipo, mensagem: "" };
    case "tarefa":
      return { id, tipo, titulo: "", prazoDias: 1 };
  }
}

function mapear(passos: Passo[], fn: (p: Passo) => Passo | null): Passo[] {
  const saida: Passo[] = [];
  for (const p of passos) {
    const novo = fn(p);
    if (novo === null) continue;
    if (novo.tipo === "ramo") {
      saida.push({
        ...novo,
        sim: mapear(novo.sim, fn),
        nao: mapear(novo.nao, fn),
      });
    } else {
      saida.push(novo);
    }
  }
  return saida;
}

function emLista(
  passos: Passo[],
  lista: string,
  fn: (itens: Passo[]) => Passo[],
): Passo[] {
  if (lista === "raiz") return fn(passos);
  const [ramoId, lado] = lista.split(":") as [string, "sim" | "nao"];
  return passos.map((p) => {
    if (p.tipo !== "ramo") return p;
    if (p.id === ramoId) return { ...p, [lado]: fn(p[lado]) } as PassoRamo;
    return {
      ...p,
      sim: emLista(p.sim, lista, fn),
      nao: emLista(p.nao, lista, fn),
    };
  });
}

/** Inserir um RAMO no meio leva os passos seguintes para o lado `nao`. */
export function inserirPasso(
  passos: Passo[],
  ponto: PontoDeInsercao,
  novo: Passo,
): Passo[] {
  return emLista(passos, ponto.lista, (itens) => {
    const i = Math.max(0, Math.min(ponto.indice, itens.length));
    const antes = itens.slice(0, i);
    const depois = itens.slice(i);
    if (novo.tipo === "ramo" && depois.length > 0) {
      return [...antes, { ...novo, nao: [...novo.nao, ...depois] }];
    }
    return [...antes, novo, ...depois];
  });
}

export function removerPasso(passos: Passo[], id: string): Passo[] {
  return mapear(passos, (p) => (p.id === id ? null : p));
}

export function atualizarPasso(
  passos: Passo[],
  id: string,
  mudanca: (p: Passo) => Passo,
): Passo[] {
  return mapear(passos, (p) => (p.id === id ? mudanca(p) : p));
}

function clonarComIdsNovos(p: Passo): Passo {
  if (p.tipo === "ramo") {
    return {
      ...p,
      id: novoId(),
      sim: p.sim.map(clonarComIdsNovos),
      nao: p.nao.map(clonarComIdsNovos),
    };
  }
  return { ...p, id: novoId() };
}

export function duplicarPasso(passos: Passo[], id: string): Passo[] {
  const duplicar = (itens: Passo[]): Passo[] => {
    const saida: Passo[] = [];
    for (const p of itens) {
      const copia = p.tipo === "ramo" ? { ...p, sim: duplicar(p.sim), nao: duplicar(p.nao) } : p;
      saida.push(copia);
      if (p.id === id) saida.push(clonarComIdsNovos(p));
    }
    return saida;
  };
  return duplicar(passos);
}

export function todosOsPassos(passos: Passo[]): Passo[] {
  const saida: Passo[] = [];
  for (const p of passos) {
    saida.push(p);
    if (p.tipo === "ramo") {
      saida.push(...todosOsPassos(p.sim), ...todosOsPassos(p.nao));
    }
  }
  return saida;
}

export function encontrarPasso(passos: Passo[], id: string): Passo | null {
  return todosOsPassos(passos).find((p) => p.id === id) ?? null;
}

/** Numeração em ordem de leitura (`sim` antes de `nao`). */
export function numerarPassos(passos: Passo[]): Map<string, number> {
  const mapa = new Map<string, number>();
  todosOsPassos(passos).forEach((p, i) => mapa.set(p.id, i + 1));
  return mapa;
}

/** Há e-mail antes deste passo no caminho (habilita "responder na mesma conversa")? */
export function haEmailAntes(passos: Passo[], id: string): boolean {
  const caminho = (itens: Passo[], vistoEmail: boolean): boolean | null => {
    let visto = vistoEmail;
    for (const p of itens) {
      if (p.id === id) return visto;
      if (p.tipo === "email") visto = true;
      if (p.tipo === "ramo") {
        const r = caminho(p.sim, visto) ?? caminho(p.nao, visto);
        if (r !== null) return r;
      }
    }
    return null;
  };
  return caminho(passos, false) ?? false;
}

export interface Problema {
  mensagem: string;
}

export function validarPassos(passos: Passo[]): Map<string, Problema[]> {
  const erros = new Map<string, Problema[]>();
  const add = (id: string, mensagem: string) => {
    erros.set(id, [...(erros.get(id) ?? []), { mensagem }]);
  };
  for (const p of todosOsPassos(passos)) {
    switch (p.tipo) {
      case "email":
        if (!p.mesmaConversa && !p.assunto.trim()) add(p.id, "O e-mail precisa de assunto.");
        if (!p.corpo.trim()) add(p.id, "O e-mail precisa de corpo.");
        break;
      case "espera":
        if (p.diasUteis < 1) add(p.id, "A espera precisa ser de pelo menos 1 dia útil.");
        break;
      case "whatsapp":
        if (!p.mensagem.trim()) add(p.id, "A mensagem de WhatsApp está vazia.");
        break;
      case "tarefa":
        if (!p.titulo.trim()) add(p.id, "A tarefa precisa de título.");
        break;
      case "ramo":
        if (p.sim.length === 0 && p.nao.length === 0)
          add(p.id, "O ramo precisa de passos em pelo menos um dos lados.");
        break;
    }
  }
  return erros;
}
