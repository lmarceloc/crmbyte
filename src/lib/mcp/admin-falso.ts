// Só para os testes do MCP: um "Supabase" que registra cada consulta (tabela, operação,
// filtros, dados gravados) e devolve o que o roteiro mandar. Serve para provar que toda
// ferramenta filtra pela conta da chave e que a escrita só acontece quando deve.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Chamada {
  tabela: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  filtros: { tipo: string; coluna: string; valor: unknown }[];
  payload?: unknown;
}
export interface Resposta {
  data: unknown;
  error?: { message: string; code?: string } | null;
}
type Roteiro = Record<string, Resposta | ((c: Chamada) => Resposta)>;

class Consulta {
  constructor(
    private c: Chamada,
    private resolver: (c: Chamada) => Resposta,
  ) {}
  select() {
    return this;
  }
  insert(p: unknown) {
    this.c.op = "insert";
    this.c.payload = p;
    return this;
  }
  update(p: unknown) {
    this.c.op = "update";
    this.c.payload = p;
    return this;
  }
  upsert(p: unknown) {
    this.c.op = "upsert";
    this.c.payload = p;
    return this;
  }
  eq(coluna: string, valor: unknown) {
    return this.filtro("eq", coluna, valor);
  }
  in(coluna: string, valor: unknown) {
    return this.filtro("in", coluna, valor);
  }
  ilike(coluna: string, valor: unknown) {
    return this.filtro("ilike", coluna, valor);
  }
  neq(coluna: string, valor: unknown) {
    return this.filtro("neq", coluna, valor);
  }
  is(coluna: string, valor: unknown) {
    return this.filtro("is", coluna, valor);
  }
  or(expressao: string) {
    return this.filtro("or", "", expressao);
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.final());
  }
  single() {
    return Promise.resolve(this.final());
  }
  then<T>(ok: (r: Resposta) => T, falha?: (e: unknown) => T) {
    return Promise.resolve(this.final()).then(ok, falha);
  }
  private filtro(tipo: string, coluna: string, valor: unknown) {
    this.c.filtros.push({ tipo, coluna, valor });
    return this;
  }
  private final(): Resposta {
    const r = this.resolver(this.c);
    return { data: r.data ?? null, error: r.error ?? null };
  }
}

export function adminFalso(roteiro: Roteiro = {}) {
  const chamadas: Chamada[] = [];
  const resolver = (c: Chamada): Resposta => {
    const r = roteiro[`${c.tabela}:${c.op}`] ?? roteiro[c.tabela];
    return typeof r === "function" ? r(c) : (r ?? { data: null });
  };
  const admin = {
    from(tabela: string) {
      const c: Chamada = { tabela, op: "select", filtros: [] };
      chamadas.push(c);
      return new Consulta(c, resolver);
    },
  } as unknown as SupabaseClient;
  return { admin, chamadas };
}

/** A chamada filtra por `account_id = conta` (ou grava com esse `account_id`)? */
export function ehDaConta(c: Chamada, conta: string): boolean {
  if (c.filtros.some((f) => f.tipo === "eq" && f.coluna === "account_id" && f.valor === conta)) return true;
  const linhas = Array.isArray(c.payload) ? c.payload : [c.payload];
  return (c.op === "insert" || c.op === "upsert") && linhas.every((l) => (l as { account_id?: string } | null)?.account_id === conta);
}
