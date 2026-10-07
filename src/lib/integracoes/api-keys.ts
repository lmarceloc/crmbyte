// Chaves de acesso à API do CRM (`api_keys`): sistemas de fora mandam dados para
// a conta dona da chave. Só o hash fica no banco; a chave em texto aparece uma vez.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

const PREFIXO = "wacrm_";

export function gerarChave(): string {
  return PREFIXO + randomBytes(24).toString("base64url");
}

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

/** Chave do cabeçalho `Authorization: Bearer …` ou `X-Api-Key`, ou null. */
export function chaveDoPedido(headers: Headers): string | null {
  const auth = headers.get("authorization")?.trim();
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const chave = bearer ?? headers.get("x-api-key")?.trim();
  return chave && chave.startsWith(PREFIXO) ? chave : null;
}

export interface ChaveApi {
  id: string;
  name: string;
  key_hint: string;
  created_at: string;
  last_used_at: string | null;
}

const CAMPOS = "id,name,key_hint,created_at,last_used_at";

export async function listarChavesApi(admin: Admin, accountId: string): Promise<ChaveApi[]> {
  const { data, error } = await admin
    .from("api_keys")
    .select(CAMPOS)
    .eq("account_id", accountId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("db_error");
  return data ?? [];
}

/** Cria a chave e devolve o texto puro — a única vez que ele existe fora de quem chama. */
export async function criarChaveApi(
  admin: Admin,
  accountId: string,
  userId: string,
  nome: string,
): Promise<{ chave: string; registro: ChaveApi }> {
  const chave = gerarChave();
  const { data, error } = await admin
    .from("api_keys")
    .insert({ account_id: accountId, user_id: userId, name: nome, key_hash: hashDaChave(chave), key_hint: chave.slice(-4) })
    .select(CAMPOS)
    .single();
  if (error) throw new Error("db_error");
  return { chave, registro: data };
}

export async function revogarChaveApi(admin: Admin, accountId: string, id: string) {
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw new Error("db_error");
}

/** Conta e dono da chave do pedido, ou null se não veio chave válida e ativa. */
export async function autenticarChaveApi(
  admin: Admin,
  headers: Headers,
): Promise<{ keyId: string; accountId: string; userId: string } | null> {
  const chave = chaveDoPedido(headers);
  if (!chave) return null;
  const { data } = await admin
    .from("api_keys")
    .select("id,account_id,user_id")
    .eq("key_hash", hashDaChave(chave))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { keyId: data.id, accountId: data.account_id, userId: data.user_id };
}
