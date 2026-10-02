import { supabaseAdmin } from "@/lib/automations/admin-client";
import { verificarToken } from "@/lib/cadencias/token";

export const dynamic = "force-dynamic";

// GIF 1x1 transparente.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7", "base64");

function gif() {
  return new Response(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
  });
}

/**
 * Pixel de abertura. Quem carrega é o cliente de e-mail do lead (sem sessão):
 * a autenticidade vem do token HMAC. SEMPRE 200 + GIF — um 4xx quebra a imagem
 * e denuncia que é dinâmico; o efeito só aparece no banco.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const payload = verificarToken(token, "pixel");
    if (payload) {
      const { error } = await supabaseAdmin().rpc("fn_cadencia_registrar_abertura", {
        p_enrollment_id: payload.enrollment_id,
        p_account_id: payload.account_id,
        p_passo_id: payload.passo_id,
      });
      if (error) console.error("[cadencia-pixel]", error.message);
    }
  } catch (e) {
    console.error("[cadencia-pixel]", e);
  }
  return gif();
}
