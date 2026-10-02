import { supabaseAdmin } from "@/lib/automations/admin-client";
import { verificarToken } from "@/lib/cadencias/token";

export const dynamic = "force-dynamic";

/**
 * Redirecionador de clique. O destino vem DENTRO do token assinado (HMAC),
 * então não é um open redirect. Registra o clique e responde 302; falha de
 * registro nunca impede o redirecionamento.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let destino: string | null = null;
  try {
    const p = verificarToken(token, "clique");
    if (p?.url && /^https?:\/\//i.test(p.url)) {
      destino = p.url;
      const { error } = await supabaseAdmin().rpc("fn_cadencia_registrar_clique", {
        p_enrollment_id: p.enrollment_id,
        p_account_id: p.account_id,
        p_passo_id: p.passo_id,
        p_url: p.url,
      });
      if (error) console.error("[cadencia-click]", error.message);
    }
  } catch (e) {
    console.error("[cadencia-click]", e);
  }
  if (!destino) return new Response("Link inválido ou expirado.", { status: 400 });
  return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
}
