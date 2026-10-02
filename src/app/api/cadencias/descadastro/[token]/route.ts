import { supabaseAdmin } from "@/lib/automations/admin-client";
import { verificarToken } from "@/lib/cadencias/token";

export const dynamic = "force-dynamic";

const pagina = (corpo: string) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#222">${corpo}</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** GET só MOSTRA a confirmação (scanners de link não descadastram sozinhos). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ok = false;
  try {
    ok = !!verificarToken(token, "descadastro");
  } catch {}
  if (!ok) return pagina("<h1>Link inválido ou expirado.</h1>");
  return pagina(
    `<h1>Deixar de receber e-mails?</h1><p>Confirme para parar de receber mensagens desta empresa.</p>
<form method="post"><button type="submit" style="padding:10px 20px;font-size:16px;cursor:pointer">Confirmar descadastro</button></form>`,
  );
}

/** POST efetiva (também atende o one-click do List-Unsubscribe-Post). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let payload;
  try {
    payload = verificarToken(token, "descadastro");
  } catch {
    payload = null;
  }
  if (!payload) return pagina("<h1>Link inválido ou expirado.</h1>");

  const admin = supabaseAdmin();
  const { data: insc } = await admin
    .from("email_cadence_enrollments")
    .select("contact_id")
    .eq("id", payload.enrollment_id)
    .eq("account_id", payload.account_id)
    .maybeSingle();
  if (insc) {
    const agora = new Date().toISOString();
    // suprime o CONTATO em toda a conta
    await admin
      .from("contacts")
      .update({ email_unsubscribed_at: agora })
      .eq("id", insc.contact_id)
      .eq("account_id", payload.account_id)
      .is("email_unsubscribed_at", null);
    const { data: paradas } = await admin
      .from("email_cadence_enrollments")
      .update({ status: "parada", motivo_parada: "descadastro", parada_em: agora })
      .eq("account_id", payload.account_id)
      .eq("contact_id", insc.contact_id)
      .eq("status", "ativa")
      .select("id,cadence_id,deal_id");
    if (paradas?.length) {
      await admin.from("email_cadence_events").insert(
        paradas.map((p) => ({
          account_id: payload.account_id,
          cadence_id: p.cadence_id,
          enrollment_id: p.id,
          deal_id: p.deal_id,
          tipo: "descadastrou",
        })),
      );
    }
  }
  return pagina("<h1>Pronto.</h1><p>Você não receberá mais e-mails desta empresa.</p>");
}
