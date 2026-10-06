import type { SupabaseClient } from "@supabase/supabase-js";
import { obterChave } from "@/lib/integracoes/chaves";

/** Que IA o "Analisar Deals" tem agora: o serviço próprio, o modelo gratuito (modo reduzido) ou nenhuma. */
export type ModoDisponivel = "servico" | "reduzido" | "nenhuma";

export async function modoDisponivel(admin: SupabaseClient, accountId: string): Promise<ModoDisponivel> {
  const [servico, openrouter] = await Promise.all([
    obterChave(admin, accountId, "analisar_deals"),
    obterChave(admin, accountId, "openrouter"),
  ]);
  return servico ? "servico" : openrouter ? "reduzido" : "nenhuma";
}
