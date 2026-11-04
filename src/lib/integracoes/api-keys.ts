// Chaves de acesso à API do CRM (`api_keys`): sistemas de fora mandam dados para
// a conta dona da chave. Só o hash fica no banco; a chave em texto aparece uma vez.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

const PREFIXO = "wacrm_";

/**
 * O que a chave alcança: `entrada` só manda contatos (as chaves antigas); `leitura` e
 * `escrita` são as do MCP (`/api/mcp`). `escrita` também pode mandar contatos.
 */
export const ACESSOS = ["entrada", "leitura", "escrita"] as const;
export type Acesso = (typeof ACESSOS)[number];

/** Valor desconhecido (ou coluna ainda ausente) vale o mais restrito: só entrada de contatos. */
export function acessoDe(valor: unknown): Acesso {
  return (ACESSOS as readonly unknown[]).includes(valor) ? (valor as Acesso) : "entrada";
}

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
  acesso: Acesso;
  key_hint: string;
  created_at: string;
  last_used_at: string | null;
}

const CAMPOS = "id,name,acesso,key_hint,created_at,last_used_at";

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
  acesso: Acesso = "entrada",
): Promise<{ chave: string; registro: ChaveApi }> {
  const chave = gerarChave();
  const { data, error } = await admin
    .from("api_keys")
    .insert({ account_id: accountId, user_id: userId, name: nome, acesso, key_hash: hashDaChave(chave), key_hint: chave.slice(-4) })
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

/** O `last_used_at` é só informativo: grava no máximo uma vez por minuto, não a cada chamada. */
const INTERVALO_DO_ULTIMO_USO_MS = 60_000;

export interface ContaDaChave {
  keyId: string;
  accountId: string;
  accountName: string;
  userId: string;
  acesso: Acesso;
}

/** Conta e dono da chave do pedido, ou null se não veio chave válida e ativa. */
export async function autenticarChaveApi(admin: Admin, headers: Headers): Promise<ContaDaChave | null> {
  const chave = chaveDoPedido(headers);
  if (!chave) return null;
  // `*` e não a lista de colunas: sem a migration 057 `acesso` não existe e a chave segue
  // valendo como `entrada`, em vez de a consulta inteira falhar.
  const { data } = await admin
    .from("api_keys")
    .select("*, account:accounts(name)")
    .eq("key_hash", hashDaChave(chave))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  const ultimo = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - ultimo > INTERVALO_DO_ULTIMO_USO_MS) {
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  const conta = (Array.isArray(data.account) ? data.account[0] : data.account) as { name: string } | null;
  return {
    keyId: data.id,
    accountId: data.account_id,
    accountName: conta?.name ?? "",
    userId: data.user_id,
    acesso: acessoDe(data.acesso),
  };
}
