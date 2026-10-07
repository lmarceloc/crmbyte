// Link rastreável de anexo do negócio: /p/<token>.
//
// GET devolve uma página mínima que, NO NAVEGADOR, envia um POST para a mesma
// URL; o POST registra a abertura e responde 303 para uma URL assinada (curta)
// do arquivo no bucket privado. Para o cliente parece que o PDF abriu direto.
//
// Por que não redirecionar já no GET: antivírus de e-mail (Safe Links do
// Microsoft 365, Mimecast, Proofpoint…) e prévias de link (WhatsApp, Slack)
// visitam a URL sozinhos. A maioria não roda JavaScript, então não chega ao
// POST e não vira "cliente abriu". O resto é filtrado pelo user-agent e por
// janela: duas aberturas do mesmo anexo em menos de 1 minuto contam como uma.
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export const BUCKET_ANEXOS = "deal-attachments";
export const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
export const JANELA_DEDUP_MS = 60_000;
const VALIDADE_URL_ASSINADA_S = 60;

const TOKEN = /^[a-f0-9]{32}$/;

export function tokenValido(token: string): boolean {
  return TOKEN.test(token);
}

// Só robôs: navegadores embutidos de apps (LinkedIn, Instagram…) são cliques de gente.
const ROBOS =
  /bot\b|bot\/|crawler|spider|preview|facebookexternalhit|whatsapp|slack|curl|wget|python|java\/|go-http|okhttp|headless|phantom|safelinks|mimecast|proofpoint|barracuda|urldefense|scanner/i;

/** User-agent de robô, verificador de link ou ausente. */
export function ehRobo(ua: string | null | undefined): boolean {
  return !ua?.trim() || ROBOS.test(ua);
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Página do GET: envia o formulário sozinha; sem JavaScript, o botão faz o mesmo. */
export function paginaDeAbertura(nomeDoArquivo: string): string {
  const nome = escapar(nomeDoArquivo);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${nome}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}
main{text-align:center;padding:24px}button{margin-top:12px;padding:10px 18px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:15px;cursor:pointer}</style>
</head><body><main>
<p>Abrindo <strong>${nome}</strong>…</p>
<form method="post"><button type="submit">Abrir arquivo</button></form>
</main>
<script>document.forms[0].submit()</script>
</body></html>`;
}

export interface AnexoDoLink {
  id: string;
  account_id: string;
  deal_id: string;
  file_path: string;
  file_name: string;
}

/** Anexo com link ativo para o token, ou null. */
export async function anexoDoToken(admin: Admin, token: string): Promise<AnexoDoLink | null> {
  if (!tokenValido(token)) return null;
  const { data } = await admin
    .from("deal_attachments")
    .select("id,account_id,deal_id,file_path,file_name")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .maybeSingle();
  return data;
}

/**
 * Registra a abertura (se não for robô nem repetição dentro da janela).
 * Falha de registro nunca impede o cliente de ver o arquivo.
 */
export async function registrarAbertura(admin: Admin, anexo: AnexoDoLink, userAgent: string | null): Promise<void> {
  if (ehRobo(userAgent)) return;
  try {
    const desde = new Date(Date.now() - JANELA_DEDUP_MS).toISOString();
    const { count } = await admin
      .from("deal_attachment_opens")
      .select("id", { count: "exact", head: true })
      .eq("attachment_id", anexo.id)
      .gte("created_at", desde);
    if (count) return;
    const agora = new Date().toISOString();
    await admin.from("deal_attachment_opens").insert({
      account_id: anexo.account_id,
      attachment_id: anexo.id,
      deal_id: anexo.deal_id,
      user_agent: userAgent?.slice(0, 400) ?? null,
      created_at: agora,
    });
    const { data: atual } = await admin.from("deal_attachments").select("open_count").eq("id", anexo.id).single();
    await admin
      .from("deal_attachments")
      .update({ open_count: (atual?.open_count ?? 0) + 1, last_opened_at: agora })
      .eq("id", anexo.id);
  } catch (e) {
    console.error("[anexo-abertura]", e);
  }
}

/** URL assinada de curta duração para o arquivo no bucket privado. */
export async function urlAssinada(admin: Admin, anexo: AnexoDoLink): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET_ANEXOS).createSignedUrl(anexo.file_path, VALIDADE_URL_ASSINADA_S);
  if (error) {
    console.error("[anexo-url]", error.message);
    return null;
  }
  return data.signedUrl;
}
