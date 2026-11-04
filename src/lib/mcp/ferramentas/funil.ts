import { z } from "zod";
import { definir, ErroDeFerramenta, type ContextoMcp } from "../tipos";

const uuid = z.string().uuid();
const MOEDA_PADRAO = "BRL";

interface Etapa {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
}

async function etapasDoFunil(ctx: ContextoMcp, pipelineId: string): Promise<Etapa[]> {
  // o funil precisa ser desta conta: pipeline_stages não tem account_id, a ligação é pelo funil
  const { data: funil } = await ctx.admin
    .from("pipelines")
    .select("id")
    .eq("id", pipelineId)
    .eq("account_id", ctx.accountId)
    .maybeSingle();
  if (!funil) throw new ErroDeFerramenta("Funil não encontrado nesta conta. Use listar_pipelines para ver os ids.");
  const { data, error } = await ctx.admin
    .from("pipeline_stages")
    .select("id,name,position,is_won")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Etapa[]).sort((a, b) => a.position - b.position);
}

export const listarPipelines = definir({
  nome: "listar_pipelines",
  descricao:
    "Lista os funis de venda da conta com suas etapas em ordem, e a moeda padrão da conta. " +
    "Use para descobrir os ids de funil e etapa antes de criar ou mover um negócio.",
  acesso: "leitura",
  entrada: z.object({}),
  async executar(ctx) {
    const [{ data, error }, { data: conta }] = await Promise.all([
      ctx.admin
        .from("pipelines")
        .select("id,name,pipeline_stages(id,name,position,is_won)")
        .eq("account_id", ctx.accountId)
        .order("created_at", { ascending: true }),
      ctx.admin.from("accounts").select("default_currency").eq("id", ctx.accountId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const pipelines = (data ?? []).map((p) => ({
      id: p.id,
      nome: p.name,
      etapas: [...((p.pipeline_stages as Etapa[] | null) ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((e) => ({ id: e.id, nome: e.name, etapa_de_ganho: !!e.is_won })),
    }));
    return { moeda_padrao: conta?.default_currency || MOEDA_PADRAO, pipelines };
  },
});

export const criarNegocio = definir({
  nome: "criar_negocio",
  descricao:
    "Cria um negócio (oportunidade) em aberto num funil, ligado a um contato que já existe. " +
    "Sem `stage_id`, entra na primeira etapa do funil. Descubra os ids com listar_pipelines e buscar_contatos.",
  acesso: "escrita",
  entrada: z.object({
    titulo: z.string().trim().min(1).max(200),
    contact_id: uuid.describe("Contato principal do negócio."),
    pipeline_id: uuid,
    stage_id: uuid.optional().describe("Etapa inicial; padrão: a primeira do funil."),
    valor: z.number().min(0).max(9_999_999_999).optional().describe("Valor do negócio. Padrão 0."),
    moeda: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "Use o código de 3 letras, ex.: BRL.")
      .optional()
      .describe("Código da moeda; padrão: a da conta."),
    data_prevista_fechamento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
      .optional(),
    temperatura: z.enum(["sem_interesse", "frio", "morno", "quente", "quase_fechando"]).default("frio"),
    notas: z.string().trim().max(2000).optional(),
  }),
  async executar(ctx, a) {
    const { data: contato } = await ctx.admin
      .from("contacts")
      .select("id,company_id")
      .eq("id", a.contact_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!contato) throw new ErroDeFerramenta("Contato não encontrado nesta conta. Use buscar_contatos ou criar_contato.");

    const etapas = await etapasDoFunil(ctx, a.pipeline_id);
    const etapa = a.stage_id ? etapas.find((e) => e.id === a.stage_id) : etapas[0];
    if (!etapa) {
      throw new ErroDeFerramenta(
        a.stage_id ? "Esta etapa não pertence ao funil informado." : "O funil não tem etapas.",
      );
    }

    let moeda = a.moeda?.toUpperCase();
    if (!moeda) {
      const { data: conta } = await ctx.admin.from("accounts").select("default_currency").eq("id", ctx.accountId).maybeSingle();
      moeda = conta?.default_currency || MOEDA_PADRAO;
    }

    const { data, error } = await ctx.admin
      .from("deals")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        title: a.titulo,
        value: a.valor ?? 0,
        currency: moeda,
        contact_id: contato.id,
        company_id: contato.company_id ?? null,
        pipeline_id: a.pipeline_id,
        stage_id: etapa.id,
        status: "open",
        temperature: a.temperatura,
        expected_close_date: a.data_prevista_fechamento ?? null,
        notes: a.notas ?? null,
        source: "mcp",
      })
      .select("id")
      .single();
    // o gatilho do banco cria o vínculo do contato principal em deal_contacts
    if (error) throw new Error(error.message);
    return { deal_id: data.id, titulo: a.titulo, etapa: etapa.name, valor: a.valor ?? 0, moeda };
  },
});

export const moverNegocio = definir({
  nome: "mover_negocio",
  descricao:
    "Move um negócio em aberto para outra etapa do MESMO funil. Mover para uma etapa de ganho não marca o negócio como ganho: " +
    "o status continua em aberto, como ao arrastar no quadro.",
  acesso: "escrita",
  entrada: z.object({
    deal_id: uuid,
    stage_id: uuid.describe("Etapa de destino, do mesmo funil do negócio."),
  }),
  async executar(ctx, a) {
    const { data: negocio } = await ctx.admin
      .from("deals")
      .select("id,title,status,pipeline_id,stage_id")
      .eq("id", a.deal_id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!negocio) throw new ErroDeFerramenta("Negócio não encontrado nesta conta.");
    if ((negocio.status ?? "open") !== "open") {
      throw new ErroDeFerramenta("Só negócios em aberto podem ser movidos de etapa.");
    }
    const etapas = await etapasDoFunil(ctx, negocio.pipeline_id as string);
    const destino = etapas.find((e) => e.id === a.stage_id);
    if (!destino) throw new ErroDeFerramenta("A etapa de destino não pertence ao funil deste negócio.");
    const origem = etapas.find((e) => e.id === negocio.stage_id);
    if (negocio.stage_id === destino.id) {
      return { movido: false, mensagem: `O negócio já está na etapa "${destino.name}".` };
    }
    const { error } = await ctx.admin
      .from("deals")
      .update({ stage_id: destino.id })
      .eq("id", negocio.id)
      .eq("account_id", ctx.accountId);
    if (error) throw new Error(error.message);
    return {
      movido: true,
      deal_id: negocio.id,
      titulo: negocio.title,
      de: origem?.name ?? null,
      para: destino.name,
      etapa_de_ganho: destino.is_won,
    };
  },
});
