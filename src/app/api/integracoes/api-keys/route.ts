import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { criarChaveApi, listarChavesApi, revogarChaveApi } from "@/lib/integracoes/api-keys";

export const dynamic = "force-dynamic";

const corpo = z.object({ name: z.string().trim().min(1).max(80) }).strict();

// Chaves de acesso à API do CRM. Nunca devolve a chave, só o nome e os 4 últimos caracteres.
export async function GET() {
  try {
    const ctx = await requireRole("admin");
    return json({ chaves: await listarChavesApi(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// Cria a chave; o texto puro vem só nesta resposta.
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const c = corpo.safeParse(await request.json().catch(() => null));
    if (!c.success) return validationFailed(c.error);
    const { chave } = await criarChaveApi(supabaseAdmin(), ctx.accountId, ctx.userId, c.data.name);
    return json({ chave, chaves: await listarChavesApi(supabaseAdmin(), ctx.accountId) }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return fail("validation_error", "Chave inválida.", 400);
    await revogarChaveApi(supabaseAdmin(), ctx.accountId, id.data);
    return json({ chaves: await listarChavesApi(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
