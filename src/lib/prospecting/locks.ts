import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProspectingError } from "./errors";

/**
 * Lock por conta (busca + worker + importação não se atropelam).
 * Lease com validade — o PostgREST não segura advisory lock entre chamadas.
 */
export async function comLock<T>(
  admin: SupabaseClient,
  accountId: string,
  fn: () => Promise<T>,
  segundos = 300,
): Promise<T> {
  const holder = crypto.randomUUID();
  const { data, error } = await admin.rpc("fn_prospecting_acquire_lock", {
    p_account_id: accountId,
    p_holder: holder,
    p_seconds: segundos,
  });
  if (error) throw new ProspectingError(`Falha ao reservar a operação: ${error.message}`, 500);
  if (!data) throw new ProspectingError("Uma operação está em andamento. Tente de novo em instantes.", 409);
  try {
    return await fn();
  } finally {
    await admin.rpc("fn_prospecting_release_lock", { p_account_id: accountId, p_holder: holder });
  }
}
