import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { requireRole } from "@/lib/auth/account";
import { CaixaError, salvarCaixaMicrosoft } from "@/lib/email/caixas";
import { COOKIE_OAUTH, conferirRetorno, MicrosoftError, trocarCodigo } from "@/lib/email/microsoft";

export const dynamic = "force-dynamic";

/** Volta do login da Microsoft: confere state/cookie/sessão, troca o código e grava a caixa. */
export async function GET(request: NextRequest) {
  const voltar = (q: string) => {
    const res = NextResponse.redirect(new URL(`/caixas-de-envio?${q}`, request.url));
    res.cookies.set({ name: COOKIE_OAUTH, value: "", path: "/api/microsoft", maxAge: 0 });
    return res;
  };
  const erro = (msg: string) => voltar(`microsoft_erro=${encodeURIComponent(msg)}`);

  const p = request.nextUrl.searchParams;
  if (p.get("error")) {
    // ex.: consent_required / access_denied — o admin da empresa ainda não autorizou o app
    const desc = p.get("error_description")?.split(/\r?\n/)[0] ?? p.get("error")!;
    return erro(
      p.get("error") === "access_denied"
        ? "Login cancelado ou acesso negado. Se a empresa exige, o administrador do Microsoft 365 precisa autorizar o app."
        : desc,
    );
  }
  try {
    const ctx = await requireRole("admin");
    const { estado, verificador } = conferirRetorno(p.get("state"), request.cookies.get(COOKIE_OAUTH)?.value, {
      accountId: ctx.accountId,
      userId: ctx.userId,
    });
    const code = p.get("code");
    if (!code) return erro("A Microsoft não devolveu o código de login.");
    const conta = await trocarCodigo(code, verificador, request.nextUrl.origin);
    await salvarCaixaMicrosoft(supabaseAdmin(), ctx.accountId, ctx.userId, estado.ownerUserId, conta);
    return voltar(`microsoft_ok=${encodeURIComponent(conta.email)}`);
  } catch (e) {
    if (e instanceof MicrosoftError || e instanceof CaixaError) return erro(e.message);
    console.error("[microsoft-callback]", e);
    return erro("Falha ao conectar com a Microsoft.");
  }
}
