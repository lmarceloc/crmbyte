import type { SupabaseClient } from "@supabase/supabase-js";

/** Acha a empresa pelo nome (sem diferenciar caixa) ou cria. Server-side. */
export async function obterOuCriarEmpresa(
  admin: SupabaseClient,
  accountId: string,
  userId: string | null,
  dados: { nome: string | null | undefined; website?: string | null; linkedin?: string | null },
): Promise<string | null> {
  const nome = dados.nome?.trim();
  if (!nome) return null;
  const buscar = async () => {
    const { data } = await admin
      .from("companies")
      .select("id,website,linkedin_url")
      .eq("account_id", accountId)
      .ilike("name", nome.replace(/[%_]/g, "\\$&"))
      .limit(1)
      .maybeSingle();
    return data;
  };
  const site = dados.website?.trim() || null;
  const existente = await buscar();
  if (existente) {
    // completa o que faltava, sem sobrescrever o que já estava preenchido
    const patch: Record<string, string> = {};
    if (!existente.website && site) patch.website = site;
    if (!existente.linkedin_url && dados.linkedin) patch.linkedin_url = dados.linkedin;
    if (Object.keys(patch).length) await admin.from("companies").update(patch).eq("id", existente.id);
    return existente.id;
  }
  const { data, error } = await admin
    .from("companies")
    .insert({ account_id: accountId, user_id: userId, name: nome, website: site, linkedin_url: dados.linkedin ?? null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return (await buscar())?.id ?? null; // corrida
    throw new Error(error.message);
  }
  return data.id;
}
