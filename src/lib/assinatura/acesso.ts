// Quem pode usar o CRM: conta isenta, assinatura em dia ou dentro dos 7 dias grátis.
import type { SupabaseClient } from "@supabase/supabase-js";

export const DIAS_DE_TESTE = 7;

export interface LinhaDeAcesso {
  status: string;
  teste_ate: string | null;
  isenta: boolean;
}

export type MotivoDoAcesso = "isenta" | "assinante" | "teste" | "teste_acabou" | "cancelada" | "sem_registro";

export interface Acesso {
  liberado: boolean;
  motivo: MotivoDoAcesso;
  testeAte: string | null;
}

/**
 * `pagamento_falhou` continua liberado: a AbacatePay tenta cobrar de novo e, se
 * desistir, manda `subscription.cancelled`. Sem linha (não deveria acontecer: a
 * migration 052 e o trigger criam uma por conta), libera em vez de trancar o cliente.
 */
export function avaliarAcesso(linha: LinhaDeAcesso | null, agora = new Date()): Acesso {
  if (!linha) return { liberado: true, motivo: "sem_registro", testeAte: null };
  const testeAte = linha.teste_ate;
  if (linha.isenta) return { liberado: true, motivo: "isenta", testeAte };
  if (linha.status === "ativa" || linha.status === "pagamento_falhou")
    return { liberado: true, motivo: "assinante", testeAte };
  if (testeAte && new Date(testeAte).getTime() > agora.getTime()) return { liberado: true, motivo: "teste", testeAte };
  return { liberado: false, motivo: linha.status === "cancelada" ? "cancelada" : "teste_acabou", testeAte };
}

/** Lê a linha da conta (cliente admin ou com RLS de membro) e avalia. */
export async function acessoDaConta(db: SupabaseClient, accountId: string, agora = new Date()): Promise<Acesso> {
  const { data, error } = await db
    .from("conta_assinatura")
    .select("status,teste_ate,isenta")
    .eq("account_id", accountId)
    .maybeSingle();
  // erro de leitura (ex.: migration ainda não rodada) não pode trancar ninguém
  if (error) return { liberado: true, motivo: "sem_registro", testeAte: null };
  return avaliarAcesso(data as LinhaDeAcesso | null, agora);
}

/** Mesma regra para várias contas de uma vez (workers): Set com as contas bloqueadas. */
export async function contasBloqueadas(db: SupabaseClient, accountIds: string[], agora = new Date()): Promise<Set<string>> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Set();
  const { data, error } = await db
    .from("conta_assinatura")
    .select("account_id,status,teste_ate,isenta")
    .in("account_id", ids);
  if (error) return new Set();
  return new Set(
    ((data ?? []) as (LinhaDeAcesso & { account_id: string })[])
      .filter((l) => !avaliarAcesso(l, agora).liberado)
      .map((l) => l.account_id),
  );
}
