// Navegação usada pelo worker: o "próximo" é sempre o irmão seguinte na lista
// onde o passo mora; fim da lista = fim do caminho (a árvore não rejunta).
import type { Passo, PassoRamo } from "./tipos";

export function passoParaExecutar(
  passos: Passo[],
  passoAtualId: string | null,
): Passo | null {
  if (passoAtualId === null) return passos[0] ?? null;
  return acharPasso(passos, passoAtualId);
}

function acharPasso(passos: Passo[], id: string): Passo | null {
  for (const p of passos) {
    if (p.id === id) return p;
    if (p.tipo === "ramo") {
      const dentro = acharPasso(p.sim, id) ?? acharPasso(p.nao, id);
      if (dentro) return dentro;
    }
  }
  return null;
}

/** Irmão seguinte do passo `id`, ou null no fim do caminho. */
export function proximoIrmao(passos: Passo[], id: string): Passo | null {
  const i = passos.findIndex((p) => p.id === id);
  if (i >= 0) return passos[i + 1] ?? null;
  for (const p of passos) {
    if (p.tipo === "ramo") {
      const dentro = proximoIrmaoEmLista(p.sim, id) ?? proximoIrmaoEmLista(p.nao, id);
      if (dentro !== undefined) return dentro;
    }
  }
  return null;
}

// undefined = "não está nesta lista"; null = "está, e é o último".
function proximoIrmaoEmLista(lista: Passo[], id: string): Passo | null | undefined {
  const i = lista.findIndex((p) => p.id === id);
  if (i >= 0) return lista[i + 1] ?? null;
  for (const p of lista) {
    if (p.tipo === "ramo") {
      const r = proximoIrmaoEmLista(p.sim, id) ?? proximoIrmaoEmLista(p.nao, id);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

export function primeiroDoLado(ramo: PassoRamo, lado: "sim" | "nao"): Passo | null {
  return ramo[lado][0] ?? null;
}
