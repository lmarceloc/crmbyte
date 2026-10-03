import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { COLUNAS_DA_TAREFA, criarTarefaSchema } from "@/lib/tarefas/tipos";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/tarefas?status=pendente|concluida&escopo=minhas|todas&contact_id=&deal_id=&limit=
export async function GET(request: Request) {
  try {
    const ctx = await requireRole("viewer");
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const escopo = sp.get("escopo") ?? "minhas";
    const contactId = sp.get("contact_id");
    const dealId = sp.get("deal_id");
    const limit = Math.min(300, Math.max(1, Number(sp.get("limit")) || 150));
    if ((contactId && !UUID.test(contactId)) || (dealId && !UUID.test(dealId))) {
      return fail("validation_failed", "Identificador inválido.", 422);
    }

    // Sessão do usuário: a RLS limita à conta.
    let q = ctx.supabase.from("tarefas").select(COLUNAS_DA_TAREFA).limit(limit);
    if (status === "pendente" || status === "concluida") q = q.eq("status", status);
    if (contactId) q = q.eq("contact_id", contactId);
    if (dealId) q = q.eq("deal_id", dealId);
    // Vinculadas a um contato/negócio mostram a conta toda (é o histórico dele).
    if (escopo === "minhas" && !contactId && !dealId) q = q.eq("responsavel_id", ctx.userId);
    q =
      status === "concluida"
        ? q.order("concluida_em", { ascending: false, nullsFirst: false })
        : q.order("prazo_em", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });

    const { data, error } = await q;
    if (error) return fail("db_error", error.message, 500);

    // Pendentes que ainda não foram vistas no sininho (para o selo de notificação).
    const { count: naoVistas } = await ctx.supabase
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente")
      .eq("responsavel_id", ctx.userId)
      .is("vista_em", null);

    return json({ tarefas: data ?? [], nao_vistas: naoVistas ?? 0, usuario_id: ctx.userId });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const corpo = criarTarefaSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const v = corpo.data;

    // Contato/negócio precisam existir na conta do usuário (a RLS esconde os de outras).
    if (v.contact_id) {
      const { data } = await ctx.supabase.from("contacts").select("id").eq("id", v.contact_id).maybeSingle();
      if (!data) return fail("contato_nao_encontrado", "Contato não encontrado.", 404);
    }
    if (v.deal_id) {
      const { data } = await ctx.supabase.from("deals").select("id").eq("id", v.deal_id).maybeSingle();
      if (!data) return fail("negocio_nao_encontrado", "Negócio não encontrado.", 404);
    }
    // Tarefa de um negócio sem contato: vincula ao contato principal, para
    // aparecer também no histórico dele.
    let contactId = v.contact_id ?? null;
    if (!contactId && v.deal_id) {
      const { data } = await ctx.supabase
        .from("deal_contacts")
        .select("contact_id")
        .eq("deal_id", v.deal_id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      contactId = data?.contact_id ?? null;
    }
    const responsavel = v.responsavel_id ?? ctx.userId;
    if (responsavel !== ctx.userId) {
      const { data } = await ctx.supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", responsavel)
        .eq("account_id", ctx.accountId)
        .maybeSingle();
      if (!data) return fail("responsavel_invalido", "Responsável não pertence à conta.", 422);
    }

    const { data, error } = await ctx.supabase
      .from("tarefas")
      .insert({
        account_id: ctx.accountId,
        titulo: v.titulo,
        descricao: v.descricao ?? null,
        tipo: v.tipo,
        contact_id: contactId,
        deal_id: v.deal_id ?? null,
        origem: "manual",
        responsavel_id: responsavel,
        criada_por: ctx.userId,
        prazo_em: v.prazo_em ?? null,
        // quem cria para si mesmo já viu; para outra pessoa, vira notificação
        vista_em: responsavel === ctx.userId ? new Date().toISOString() : null,
      })
      .select(COLUNAS_DA_TAREFA)
      .single();
    if (error) return fail("db_error", error.message, 500);
    return json({ tarefa: data }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
