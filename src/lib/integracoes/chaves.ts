// Chaves de API de serviços externos, por conta, cifradas em `integration_keys`.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";

type Admin = SupabaseClient;

export type Provedor = "apify" | "treg";
export const PROVEDORES: Provedor[] = ["apify", "treg"];

export function ehProvedor(v: unknown): v is Provedor {
  return typeof v === "string" && (PROVEDORES as string[]).includes(v);
}

/** Chave da instalação (variável de ambiente), usada só se a conta não cadastrou a sua. */
function chaveDoAmbiente(p: Provedor): string | null {
  const v = p === "treg" ? process.env.TREG_API_KEY : undefined;
  return v?.trim() || null;
}

/** Chave em texto puro: a da conta, senão a do ambiente, senão null. */
export async function obterChave(admin: Admin, accountId: string, p: Provedor): Promise<string | null> {
  const { data } = await admin
    .from("integration_keys")
    .select("credential_encrypted")
    .eq("account_id", accountId)
    .eq("provider", p)
    .maybeSingle();
  if (data) {
    try {
      return decrypt(data.credential_encrypted);
    } catch {
      return null; // não decifra (ENCRYPTION_KEY trocada): trata como ausente
    }
  }
  return chaveDoAmbiente(p);
}

export async function salvarChave(admin: Admin, accountId: string, userId: string, p: Provedor, chave: string) {
  const { error } = await admin.from("integration_keys").upsert(
    {
      account_id: accountId,
      provider: p,
      credential_encrypted: encrypt(chave),
      key_hint: chave.slice(-4),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,provider" },
  );
  if (error) throw new Error("db_error");
}

export async function removerChave(admin: Admin, accountId: string, p: Provedor) {
  const { error } = await admin.from("integration_keys").delete().eq("account_id", accountId).eq("provider", p);
  if (error) throw new Error("db_error");
}

export interface StatusChave {
  provider: Provedor;
  configurada: boolean;
  origem: "conta" | "instalacao" | null;
  hint: string | null;
  updated_at: string | null;
}

export async function statusChaves(admin: Admin, accountId: string): Promise<StatusChave[]> {
  const { data } = await admin
    .from("integration_keys")
    .select("provider,key_hint,updated_at")
    .eq("account_id", accountId);
  return PROVEDORES.map((p) => {
    const r = data?.find((x) => x.provider === p);
    if (r) return { provider: p, configurada: true, origem: "conta", hint: r.key_hint, updated_at: r.updated_at };
    const env = !!chaveDoAmbiente(p);
    return { provider: p, configurada: env, origem: env ? "instalacao" : null, hint: null, updated_at: null };
  });
}
