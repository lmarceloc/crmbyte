import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { ProspectingError } from "@/lib/prospecting/errors";
import * as apify from "@/lib/prospecting/apify";
import { ehProvedor, removerChave, salvarChave, statusChaves } from "@/lib/integracoes/chaves";

export const dynamic = "force-dynamic";

const corpo = z
  .object({ provider: z.enum(["apify", "treg", "openrouter"]), api_key: z.string().trim().min(10).max(500) })
  .strict();

// Nunca devolve a chave: só status, origem e os 4 últimos caracteres.
export async function GET() {
  try {
    const ctx = await requireRole("admin");
    return json({ chaves: await statusChaves(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const c = corpo.safeParse(await request.json().catch(() => null));
    if (!c.success) return validationFailed(c.error);
    if (c.data.provider === "apify") await apify.validarChave(c.data.api_key); // recusa antes de salvar
    await salvarChave(supabaseAdmin(), ctx.accountId, ctx.userId, c.data.provider, c.data.api_key);
    return json({ chaves: await statusChaves(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    if (e instanceof ProspectingError) return fail("invalid_key", e.message, e.status);
    return toErrorResponse(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const provider = new URL(request.url).searchParams.get("provider");
    if (!ehProvedor(provider)) return fail("validation_error", "Serviço inválido.", 400);
    await removerChave(supabaseAdmin(), ctx.accountId, provider);
    return json({ chaves: await statusChaves(supabaseAdmin(), ctx.accountId) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
