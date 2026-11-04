import { z } from "zod";
import { COLUNAS_DA_TAREFA, criarTarefaSchema } from "@/lib/tarefas/tipos";
import { inscreverEmCadencia } from "@/lib/cadencias/inscrever";
import { definir, ErroDeFerramenta } from "../tipos";

const uuid = z.string().uuid();

export const criarTarefa = definir({
  nome: "criar_tarefa",
  descricao:
    "Cria uma tarefa (follow-up, ligação, reunião…), opcionalmente ligada a um contato e/ou negócio, com prazo. " +
    "Sem `responsavel_id`, fica com o dono da chave. O prazo é data e hora com fuso, ex.: 2026-11-10T14:00:00-03:00.",
  acesso: "escrita",
  entrada: criarTarefaSchema,
  async executar(ctx, v) {
    if (v.contact_id) {
      const { data } = await ctx.admin
        .from("contacts")
        .select("id")
        .eq("id", v.contact_id)
        .eq("account_id", ctx.accountId)
        .maybeSingle();
      if (!data) throw new ErroDeFerramenta("Contato não encontrado nesta conta.");
    }
    if (v.deal_id) {
      const { data } = await ctx.admin
        .from("deals")
        .select("id")
        .eq("id", v.deal_id)
        .eq("account_id", ctx.accountId)
        .maybeSingle();
      if (!data) throw new ErroDeFerramenta("Negócio não encontrado nesta conta.");
    }
    // Tarefa de um negócio sem contato: vincula ao contato principal (mesma regra da tela).
    let contactId = v.contact_id ?? null;
    if (!contactId && v.deal_id) {
      const { data } = await ctx.admin
        .from("deal_contacts")
        .select("contact_id")
        .eq("deal_id", v.deal_id)
        .eq("account_id", ctx.accountId)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      contactId = data?.contact_id ?? null;
    }
    const responsavel = v.responsavel_id ?? ctx.userId;
    if (responsavel !== ctx.userId) {
      const { data } = await ctx.admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", responsavel)
        .eq("account_id", ctx.accountId)
        .maybeSingle();
      if (!data) throw new ErroDeFerramenta("O responsável não pertence a esta conta.");
    }
    const { data, error } = await ctx.admin
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
        // para si mesmo já nasce vista; para outra pessoa, vira notificação
        vista_em: responsavel === ctx.userId ? new Date().toISOString() : null,
      })
      .select(COLUNAS_DA_TAREFA)
      .single();
    if (error) throw new Error(error.message);
    return { tarefa: data };
  },
});

export const adicionarNota = definir({
  nome: "adicionar_nota",
  descricao:
    "Adiciona uma nota de texto ao histórico de um contato. Não notifica ninguém: @menções não são processadas, " +
    "o texto é gravado como escrito.",
  acesso: "escrita",
  entrada: z.object({
    contact_id: uuid,
    texto: z.string().trim().min(1).max(5000),
  }),
  async executar(ctx, a) {
    const { data: contato } = await ctx.admin
      .from("contacts")
      .select("id")
      .eq("id", a.contact_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!contato) throw new ErroDeFerramenta("Contato não encontrado nesta conta.");
    const { data, error } = await ctx.admin
      .from("contact_notes")
      .insert({ account_id: ctx.accountId, contact_id: contato.id, user_id: ctx.userId, note_text: a.texto })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { nota_id: data.id, contact_id: contato.id };
  },
});

export const listarCadencias = definir({
  nome: "listar_cadencias",
  descricao:
    "Lista as cadências de e-mail da conta (id, nome e status). Só as de status `ativa` aceitam novas inscrições.",
  acesso: "leitura",
  entrada: z.object({
    status: z.enum(["rascunho", "ativa", "pausada"]).optional(),
  }),
  async executar(ctx, a) {
    let q = ctx.admin
      .from("email_cadences")
      .select("id,name,status,updated_at")
      .eq("account_id", ctx.accountId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (a.status) q = q.eq("status", a.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { cadencias: (data ?? []).map((c) => ({ id: c.id, nome: c.name, status: c.status })) };
  },
});

export const inscreverEmCadenciaFerramenta = definir({
  nome: "inscrever_em_cadencia",
  descricao:
    "Inscreve numa cadência de e-mail ATIVA os contatos de um negócio (`deal_id`, opcionalmente só um `contact_id`) " +
    "ou contatos soltos (`contact_ids`). Informe um ou outro. Só entram contatos com e-mail que não pediram para sair, " +
    "e um lead fica em uma cadência por vez. Isso passa a ENVIAR e-mails reais aos contatos conforme os passos da cadência.",
  acesso: "escrita",
  entrada: z
    .object({
      cadence_id: uuid,
      deal_id: uuid.optional(),
      contact_id: uuid.optional().describe("Com deal_id: inscreve só este contato do negócio."),
      contact_ids: z.array(uuid).min(1).max(200).optional(),
    })
    .refine((a) => !!a.deal_id !== !!a.contact_ids, {
      message: "Informe deal_id OU contact_ids, não os dois nem nenhum.",
    })
    .refine((a) => !a.contact_id || !!a.deal_id, { message: "contact_id só vale junto com deal_id.", path: ["contact_id"] }),
  async executar(ctx, a) {
    const entrada = a.deal_id
      ? { deal_id: a.deal_id, ...(a.contact_id ? { contact_id: a.contact_id } : {}) }
      : { contact_ids: a.contact_ids as string[] };
    const r = await inscreverEmCadencia(ctx.admin, ctx, a.cadence_id, entrada);
    // 5xx é falha nossa (detalhe só no log); o resto é regra de negócio que a IA pode corrigir
    if (!r.ok) throw r.status >= 500 ? new Error(r.message) : new ErroDeFerramenta(r.message);
    return { inscritos: r.inscritos, ignorados: r.ignorados };
  },
});
