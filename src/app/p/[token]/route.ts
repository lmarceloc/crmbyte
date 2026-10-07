import { supabaseAdmin } from "@/lib/automations/admin-client";
import { anexoDoToken, paginaDeAbertura, registrarAbertura, urlAssinada } from "@/lib/anexos/abertura";

export const dynamic = "force-dynamic";

const naoEncontrado = () =>
  new Response("Link inválido ou desativado.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });

// Link rastreável de anexo do negócio (ver src/lib/anexos/abertura.ts).
// GET: página mínima que se envia sozinha no navegador — robôs e antivírus de
// e-mail que só "olham" o link param aqui e não contam como abertura.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const anexo = await anexoDoToken(supabaseAdmin(), token);
  if (!anexo) return naoEncontrado();
  return new Response(paginaDeAbertura(anexo.file_name), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

// POST: registra a abertura e manda o navegador para o arquivo (URL assinada, curta).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const anexo = await anexoDoToken(admin, token);
  if (!anexo) return naoEncontrado();
  await registrarAbertura(admin, anexo, request.headers.get("user-agent"));
  const url = await urlAssinada(admin, anexo);
  if (!url) return new Response("Não foi possível abrir o arquivo agora.", { status: 502 });
  return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
}
