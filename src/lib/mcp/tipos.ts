import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

/** Conta e dono da chave que chamou. Toda consulta das ferramentas filtra por `accountId`. */
export interface ContextoMcp {
  admin: SupabaseClient;
  accountId: string;
  userId: string;
}

/** Nível mínimo da chave: `leitura` só consulta, `escrita` também grava. */
export type AcessoDaFerramenta = "leitura" | "escrita";

export interface FerramentaMcp {
  nome: string;
  descricao: string;
  acesso: AcessoDaFerramenta;
  entrada: z.ZodType;
  executar(ctx: ContextoMcp, args: unknown): Promise<unknown>;
}

/**
 * Erro esperado de uma ferramenta (contato que não existe, cadência pausada…). A mensagem
 * volta à IA como resultado da ferramenta, para ela se corrigir; qualquer outro erro vira
 * uma mensagem genérica e o detalhe fica só no log do servidor.
 */
export class ErroDeFerramenta extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeFerramenta";
  }
}

/** Define uma ferramenta mantendo `args` tipado pelo schema de entrada. */
export function definir<S extends z.ZodType>(f: {
  nome: string;
  descricao: string;
  acesso: AcessoDaFerramenta;
  entrada: S;
  executar: (ctx: ContextoMcp, args: z.infer<S>) => Promise<unknown>;
}): FerramentaMcp {
  return f as unknown as FerramentaMcp;
}
