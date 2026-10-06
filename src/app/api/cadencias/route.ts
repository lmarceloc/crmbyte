import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { criarCadenciaSchema, listarCadenciasSchema } from "@/lib/cadencias/schemas";
import { configuracaoPadrao } from "@/lib/cadencias/tipos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const q = listarCadenciasSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!q.success) return validationFailed(q.error);
    let consulta = ctx.supabase
      .from("email_cadences")
      .select("id,name,status,configuracao,versao,passos,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(q.data.limit);
    if (q.data.status) consulta = consulta.eq("status", q.data.status);
    const { data, error } = await consulta;
    if (error) return fail("db_error", error.message, 500);
    // a lista não precisa da árvore inteira, só do resumo
    const cadencias = (data ?? []).map(({ passos, ...resto }) => ({
      ...resto,
      passos: undefined,
      total_passos: contar(passos),
    }));
    return json({ cadencias });
  } catch (e) {
    return toErrorResponse(e);
  }
}

function contar(passos: unknown): number {
  if (!Array.isArray(passos)) return 0;
  return passos.reduce<number>(
    (n, p) => n + (p?.tipo === "fim" ? 0 : 1) + (p?.tipo === "ramo" ? contar(p.sim) + contar(p.nao) : 0),
    0,
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const corpo = criarCadenciaSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const configuracao = { ...configuracaoPadrao(), tagDoSegmento: corpo.data.tagDoSegmento ?? "" };
    const { data, error } = await supabaseAdmin()
      .from("email_cadences")
      .insert({
        account_id: ctx.accountId,
        name: corpo.data.name,
        configuracao,
        passos: [],
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) return fail("db_error", error.message, 500);
    return json({ cadencia: data }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
