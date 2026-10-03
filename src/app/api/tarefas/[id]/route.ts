import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { COLUNAS_DA_TAREFA, editarTarefaSchema } from "@/lib/tarefas/tipos";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAO_ENCONTRADA = () => fail("tarefa_nao_encontrada", "Tarefa não encontrada.", 404);

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NAO_ENCONTRADA();
    const ctx = await requireRole("agent");
    const corpo = editarTarefaSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const { status, vista, ...resto } = corpo.data;

    const { data: atual } = await ctx.supabase.from("tarefas").select("id,vista_em").eq("id", id).maybeSingle();
    if (!atual) return NAO_ENCONTRADA();

    const agora = new Date().toISOString();
    const mudancas: Record<string, unknown> = { ...resto };
    if (status === "concluida") {
      mudancas.status = "concluida";
      mudancas.concluida_em = agora;
      mudancas.concluida_por = ctx.userId;
      if (!atual.vista_em) mudancas.vista_em = agora;
    } else if (status === "pendente") {
      mudancas.status = "pendente";
      mudancas.concluida_em = null;
      mudancas.concluida_por = null;
    }
    if (vista && !atual.vista_em) mudancas.vista_em = agora;
    // reatribuir a outra pessoa gera uma nova notificação para ela
    if (resto.responsavel_id !== undefined) mudancas.vista_em = null;

    const { data, error } = await ctx.supabase
      .from("tarefas")
      .update(mudancas)
      .eq("id", id)
      .select(COLUNAS_DA_TAREFA)
      .maybeSingle();
    if (error) return fail("db_error", error.message, 500);
    if (!data) return NAO_ENCONTRADA();
    return json({ tarefa: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NAO_ENCONTRADA();
    const ctx = await requireRole("admin");
    const { error } = await ctx.supabase.from("tarefas").delete().eq("id", id);
    if (error) return fail("db_error", error.message, 500);
    return json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
