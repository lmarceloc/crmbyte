// Cache das respostas da IA em `analisar_deals_cache` (migration 045). Só o
// servidor acessa a tabela (service role). Falha de leitura ou gravação nunca
// derruba a análise: sem cache, a IA só é chamada de novo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveDoCache, VALIDADE_DO_CACHE_MS, type CacheDeRespostas, type RespostaGuardada } from "./julgar-negocios";

const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const confiancaOuNula = (v: unknown): number | null => (ehNumero(v) ? v : null);

/** Confere o JSON guardado: linha adulterada ou de formato antigo é ignorada. */
function lerGuardada(v: unknown): RespostaGuardada | null {
  const o = v as { tipo?: unknown; nivel?: unknown; opcao?: unknown; confianca?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  if (o.tipo === "score" && ehNumero(o.nivel)) return { tipo: "score", nivel: o.nivel, confianca: confiancaOuNula(o.confianca) };
  if (o.tipo === "choice" && typeof o.opcao === "string") return { tipo: "choice", opcao: o.opcao, confianca: confiancaOuNula(o.confianca) };
  return null;
}

export function cacheNoBanco(admin: SupabaseClient, accountId: string, agora: () => number = Date.now): CacheDeRespostas {
  return {
    async ler(hashes, perguntas) {
      const lidas = new Map<string, RespostaGuardada>();
      if (hashes.size === 0 || perguntas.length === 0) return lidas;
      const { data, error } = await admin
        .from("analisar_deals_cache")
        .select("deal_id,pergunta,hash,resposta,criado_em")
        .eq("account_id", accountId)
        .in("deal_id", [...hashes.keys()])
        .in("pergunta", perguntas);
      if (error) {
        console.error("[analisar-deals] cache (leitura):", error.message);
        return lidas;
      }
      for (const linha of data ?? []) {
        if (linha.hash !== hashes.get(linha.deal_id as string)) continue;
        if (agora() - new Date(linha.criado_em as string).getTime() > VALIDADE_DO_CACHE_MS) continue;
        const g = lerGuardada(linha.resposta);
        if (g) lidas.set(chaveDoCache(linha.deal_id as string, linha.pergunta as string), g);
      }
      return lidas;
    },

    async gravar(linhas) {
      if (linhas.length === 0) return;
      const criadoEm = new Date(agora()).toISOString();
      const { error } = await admin.from("analisar_deals_cache").upsert(
        linhas.map((l) => ({
          account_id: accountId,
          deal_id: l.dealId,
          pergunta: l.pergunta,
          hash: l.hash,
          resposta: l.resposta,
          criado_em: criadoEm,
        })),
        { onConflict: "account_id,deal_id,pergunta" },
      );
      if (error) console.error("[analisar-deals] cache (gravação):", error.message);
    },
  };
}
