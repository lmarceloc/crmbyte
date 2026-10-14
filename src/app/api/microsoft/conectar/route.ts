import { type NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/account";
import { toErrorResponse } from "@/lib/api-utils";
import { COOKIE_OAUTH, iniciarLogin, MicrosoftError } from "@/lib/email/microsoft";

export const dynamic = "force-dynamic";

/** Começa o login com a Microsoft para conectar uma caixa (admin+). ?dono=<user_id> opcional. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("admin");
    const dono = request.nextUrl.searchParams.get("dono");
    const ownerUserId = dono && /^[0-9a-f-]{36}$/i.test(dono) ? dono : null;
    const { url, cookie } = iniciarLogin(
      { accountId: ctx.accountId, userId: ctx.userId, ownerUserId },
      request.nextUrl.origin,
    );
    const res = NextResponse.redirect(url);
    res.cookies.set({
      name: COOKIE_OAUTH,
      value: cookie,
      httpOnly: true,
      secure: true,
      sameSite: "lax", // volta da Microsoft é uma navegação GET de outro site
      path: "/api/microsoft",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    if (e instanceof MicrosoftError)
      return NextResponse.redirect(new URL(`/caixas-de-envio?microsoft_erro=${encodeURIComponent(e.message)}`, request.url));
    return toErrorResponse(e);
  }
}
