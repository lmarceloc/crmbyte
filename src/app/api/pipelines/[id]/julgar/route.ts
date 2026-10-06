import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { cacheNoBanco } from "@/lib/ia/cache-analisar-deals";
import { IaError } from "@/lib/ia/erro";
import { julgarComServico, julgarReduzido, type ResultadoDoLote } from "@/lib/ia/julgar-negocios";
import { obterChave } from "@/lib/integracoes/chaves";
import { LIMITES_DA_ANALISE } from "@/lib/pipeline/config";
import { CRITERIOS_DE_IA } from "@/lib/pipeline/criterios";
import { LIMITES_DO_TEXTO, montarEstado, resumirNegocio, type NegocioBruto } from "@/lib/pipeline/sinais";

export const dynamic = "force-dynamic";
// até ~45 s de chamadas à IA (6 em paralelo) + consultas
export const maxDuration = 60;
type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corpo = z
  .object({
    deal_ids: z.array(z.string().uuid()).min(1).max(LIMITES_DA_ANALISE.porChamada),
    criterios: z.array(z.enum(CRITERIOS_DE_IA)).max(CRITERIOS_DE_IA.length).default([]),
    proxima_acao: z.boolean().default(false),
  })
  .strict()
  .refine((c) => c.criterios.length > 0 || c.proxima_acao, { message: "Escolha pelo menos uma pergunta para a IA." });

const COLUNAS_DO_NEGOCIO =
  "id,title,value,currency,notes,expected_close_date,stage_id,stage_entered_at,updated_at,created_at,contact_id," +
  "stage:pipeline_stages(name),company:companies(name),deal_contacts(contact_id)";

type NegocioDaIa = Pick<
  NegocioBruto,
  "id" | "title" | "value" | "currency" | "notes" | "expected_close_date" | "stage" | "company" | "stage_entered_at" | "updated_at" | "created_at"
> & { contact_id: string | null; deal_contacts: { contact_id: string }[] | null };

/**
 * Pede à IA o julgamento de até 20 negócios por vez (a tela chama em blocos). O texto enviado é
 * montado AQUI, no servidor, a partir do banco: o navegador não escolhe o que sai para o serviço
 * externo. Sem e-mail nem telefone; negócio sem nada para ler não é enviado.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return fail("funil_nao_encontrado", "Funil não encontrado.", 404);
    const ctx = await requireRole("agent");
    const c = corpo.safeParse(await request.json().catch(() => null));
    if (!c.success) return validationFailed(c.error);
    const { deal_ids: ids, criterios, proxima_acao: proximaAcao } = c.data;

    const admin = supabaseAdmin();
    const [chaveDoServico, chaveDoOpenRouter] = await Promise.all([
      obterChave(admin, ctx.accountId, "analisar_deals"),
      obterChave(admin, ctx.accountId, "openrouter"),
    ]);
    if (!chaveDoServico && !chaveDoOpenRouter)
      return fail(
        "analisar_deals_sem_chave",
        "Cadastre a chave do Analisar Deals (ou a do OpenRouter) em Configurações → Chaves de API para usar a IA.",
        400,
      );
    const modo = chaveDoServico ? "servico" : "reduzido";
    if (modo === "reduzido" && ids.length > LIMITES_DA_ANALISE.modoReduzido)
      return fail(
        "validation_failed",
        `O modo reduzido analisa no máximo ${LIMITES_DA_ANALISE.modoReduzido} negócios por vez.`,
        422,
      );

    // ---- dados dos negócios (sessão do usuário: a RLS decide o que ele pode ler)
    const { data: negocios, error: erroNegocios } = await ctx.supabase
      .from("deals")
      .select(COLUNAS_DO_NEGOCIO)
      .eq("pipeline_id", id)
      .in("id", ids);
    if (erroNegocios) return fail("db_error", erroNegocios.message, 500);
    const achados = (negocios ?? []) as unknown as NegocioDaIa[];

    const contatosDoNegocio = new Map<string, string[]>();
    for (const n of achados) {
      const todos = new Set<string>([...(n.contact_id ? [n.contact_id] : []), ...(n.deal_contacts ?? []).map((d) => d.contact_id)]);
      contatosDoNegocio.set(n.id, [...todos]);
    }
    const contatos = [...new Set([...contatosDoNegocio.values()].flat())];

    const [notasRes, conversasRes] = await Promise.all([
      contatos.length
        ? ctx.supabase
            .from("contact_notes")
            .select("contact_id,created_at,note_text")
            .in("contact_id", contatos)
            .order("created_at", { ascending: false })
            .limit(ids.length * 10)
        : { data: [], error: null },
      contatos.length
        ? ctx.supabase.from("conversations").select("id,contact_id").in("contact_id", contatos)
        : { data: [], error: null },
    ]);
    if (notasRes.error) return fail("db_error", notasRes.error.message, 500);
    if (conversasRes.error) return fail("db_error", conversasRes.error.message, 500);

    const conversas = (conversasRes.data ?? []) as { id: string; contact_id: string }[];
    const mensagensRes = conversas.length
      ? await ctx.supabase
          .from("messages")
          .select("conversation_id,created_at,content_text")
          .in("conversation_id", conversas.map((x) => x.id))
          .eq("sender_type", "customer")
          .eq("content_type", "text")
          .order("created_at", { ascending: false })
          .limit(ids.length * 10)
      : { data: [], error: null };
    if (mensagensRes.error) return fail("db_error", mensagensRes.error.message, 500);

    const contatoDaConversa = new Map(conversas.map((x) => [x.id, x.contact_id]));
    const notas = (notasRes.data ?? []) as { contact_id: string; created_at: string; note_text: string }[];
    const mensagens = (mensagensRes.data ?? []) as { conversation_id: string; created_at: string; content_text: string | null }[];

    const agora = new Date();
    const comTexto: { id: string; estado: ReturnType<typeof montarEstado>["estado"] }[] = [];
    const semDados: string[] = [];
    for (const n of achados) {
      const meus = new Set(contatosDoNegocio.get(n.id));
      const { estado, temTexto } = montarEstado({
        negocio: resumirNegocio(n, agora),
        previsaoDeFechamento: n.expected_close_date ? String(n.expected_close_date).slice(0, 10) : null,
        observacoes: n.notes,
        notas: notas.filter((x) => meus.has(x.contact_id)).slice(0, LIMITES_DO_TEXTO.notas),
        mensagens: mensagens
          .filter((m) => meus.has(contatoDaConversa.get(m.conversation_id) ?? ""))
          .slice(0, LIMITES_DO_TEXTO.mensagens),
      });
      if (temTexto) comTexto.push({ id: n.id, estado });
      else semDados.push(n.id);
    }
    const naoEncontrados = ids.filter((d) => !achados.some((n) => n.id === d));

    let resultado: ResultadoDoLote = { respostas: {}, doCache: 0, falhas: [], pendentes: [], limiteAtingido: false, uso: { entrada: 0, saida: 0 } };
    if (comTexto.length > 0) {
      const comum = { negocios: comTexto, criterios, proximaAcao, cache: cacheNoBanco(admin, ctx.accountId) };
      resultado =
        modo === "servico"
          ? await julgarComServico({ ...comum, chave: chaveDoServico! })
          : await julgarReduzido({ ...comum, chave: chaveDoOpenRouter! });
    }

    return json({
      modo,
      resultados: resultado.respostas,
      sem_dados: semDados,
      falhas: [
        ...resultado.falhas.map((f) => ({ deal_id: f.dealId, motivo: f.motivo })),
        ...naoEncontrados.map((d) => ({ deal_id: d, motivo: "Negócio não encontrado neste funil." })),
      ],
      pendentes: resultado.pendentes,
      limite_de_uso: resultado.limiteAtingido,
      do_cache: resultado.doCache,
      uso: resultado.uso,
    });
  } catch (e) {
    if (e instanceof IaError) return fail(e.code, e.message, e.status);
    return toErrorResponse(e);
  }
}
