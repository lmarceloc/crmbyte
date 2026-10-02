import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { validarPassos, todosOsPassos } from "@/lib/cadencias/arvore";
import { editarCadenciaSchema, mudarStatusSchema } from "@/lib/cadencias/schemas";
import type { Passo } from "@/lib/cadencias/tipos";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    const ctx = await requireRole("agent");
    const { data, error } = await ctx.supabase.from("email_cadences").select("*").eq("id", id).maybeSingle();
    if (error) return fail("db_error", error.message, 500);
    if (!data) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    return json({ cadencia: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const TRANSICOES: Record<string, string[]> = {
  rascunho: ["ativa"],
  ativa: ["pausada"],
  pausada: ["ativa", "rascunho"],
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const corpoBruto = await request.json().catch(() => null);

    const { data: atual } = await admin
      .from("email_cadences")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!atual) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);

    // ---- mudança de status
    if (corpoBruto && typeof corpoBruto === "object" && "status" in corpoBruto) {
      const s = mudarStatusSchema.safeParse(corpoBruto);
      if (!s.success) return validationFailed(s.error);
      if (!TRANSICOES[atual.status]?.includes(s.data.status))
        return fail("cadencia_estado_invalido", `Não é possível ir de "${atual.status}" para "${s.data.status}".`, 409);
      if (s.data.status === "ativa") {
        const passos = atual.passos as Passo[];
        const emails = todosOsPassos(passos).filter((p) => p.tipo === "email");
        const cfg = atual.configuracao as { janela?: { dias?: string[] }; tagDoSegmento?: string };
        if (passos.length === 0 || emails.length === 0)
          return fail("cadencia_sem_passos", "Adicione pelo menos um passo de e-mail antes de ativar.", 422);
        if (validarPassos(passos).size > 0)
          return fail("cadencia_sem_passos", "Há passos incompletos. Corrija antes de ativar.", 422);
        if (!cfg.janela?.dias?.length)
          return fail("cadencia_sem_passos", "Escolha ao menos um dia da semana na janela de envio.", 422);
      }
      const { data, error } = await admin
        .from("email_cadences")
        .update({ status: s.data.status, updated_by: ctx.userId })
        .eq("id", id)
        .eq("account_id", ctx.accountId)
        .eq("status", atual.status) // otimista
        .select("*");
      if (error) return fail("db_error", error.message, 500);
      if (!data?.length) return fail("cadencia_estado_invalido", "O estado mudou, recarregue a página.", 409);
      return json({ cadencia: data[0] });
    }

    // ---- edição de conteúdo
    const c = editarCadenciaSchema.safeParse(corpoBruto);
    if (!c.success) return validationFailed(c.error);
    if (atual.status === "ativa")
      return fail("cadencia_nao_editavel", "Pause a cadência antes de editar.", 409);
    const mudanca: Record<string, unknown> = { updated_by: ctx.userId };
    if (c.data.name !== undefined) mudanca.name = c.data.name;
    if (c.data.configuracao !== undefined) mudanca.configuracao = c.data.configuracao;
    if (c.data.passos !== undefined) {
      mudanca.passos = c.data.passos;
      mudanca.versao = atual.versao + 1;
    }
    const { data, error } = await admin
      .from("email_cadences")
      .update(mudanca)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();
    if (error) return fail("db_error", error.message, 500);
    return json({ cadencia: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    const ctx = await requireRole("admin");
    const admin = supabaseAdmin();
    const { data: atual } = await admin
      .from("email_cadences")
      .select("status")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!atual) return fail("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    if (atual.status === "ativa") return fail("cadencia_nao_editavel", "Pause a cadência antes de excluir.", 409);
    const { error } = await admin.from("email_cadences").delete().eq("id", id).eq("account_id", ctx.accountId);
    if (error) return fail("db_error", error.message, 500);
    return json({ id, deleted: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
