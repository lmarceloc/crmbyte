import { z } from "zod";
import type { Passo } from "./tipos";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

const passoEmail = z.object({
  id: z.string().min(1),
  tipo: z.literal("email"),
  assunto: z.string().max(300),
  corpo: z.string().max(20_000),
  mesmaConversa: z.boolean(),
});
const passoEspera = z.object({
  id: z.string().min(1),
  tipo: z.literal("espera"),
  diasUteis: z.number().int().min(1).max(365),
});
const passoWhatsapp = z.object({
  id: z.string().min(1),
  tipo: z.literal("whatsapp"),
  mensagem: z.string().max(4096),
});
const passoTarefa = z.object({
  id: z.string().min(1),
  tipo: z.literal("tarefa"),
  titulo: z.string().max(300),
  prazoDias: z.number().int().min(0).max(365),
});
const condicao = z.union([
  z.object({
    tipo: z.literal("abriu"),
    vezes: z.number().int().min(1).max(50),
    dentroDeDias: z.number().int().min(1).max(365),
  }),
  z.object({
    tipo: z.literal("clicou"),
    dentroDeDias: z.number().int().min(1).max(365),
  }),
  z.object({
    tipo: z.literal("respondeu"),
    dentroDeDias: z.number().int().min(1).max(365),
  }),
]);

// `z.lazy` recursivo não é discriminável em compile-time — por isso `union`.
export const passoSchema: z.ZodType<Passo> = z.lazy(() =>
  z.union([
    passoEmail,
    passoEspera,
    passoWhatsapp,
    passoTarefa,
    z.object({
      id: z.string().min(1),
      tipo: z.literal("ramo"),
      condicao,
      sim: z.array(passoSchema).max(200),
      nao: z.array(passoSchema).max(200),
    }),
  ]),
) as z.ZodType<Passo>;

export const passosSchema = z.array(passoSchema).max(500);

export const configuracaoSchema = z.object({
  tagDoSegmento: z.string().trim().max(80),
  somenteEmailValidado: z.boolean(),
  caixaPadraoId: z.string().uuid().nullable(),
  janela: z.object({
    inicio: z.string().regex(/^\d{2}:\d{2}$/),
    fim: z.string().regex(/^\d{2}:\d{2}$/),
    dias: z.array(z.enum(DIAS)).max(7),
  }),
  fuso: z.string().trim().min(1).max(80),
  limiteDiarioPorCaixa: z.number().int().min(1).max(10_000),
  paradas: z.object({
    respondeu: z.boolean(),
    bounce: z.boolean(),
    descadastro: z.boolean(),
    ganhoOuPerdido: z.boolean(),
  }),
});

export const criarCadenciaSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    tagDoSegmento: z.string().trim().max(80).optional(),
  })
  .strict();

export const editarCadenciaSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    configuracao: configuracaoSchema.optional(),
    passos: passosSchema.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.configuracao !== undefined || v.passos !== undefined, {
    message: "Nada para atualizar.",
  });

export const mudarStatusSchema = z
  .object({ status: z.enum(["ativa", "pausada", "rascunho"]) })
  .strict();

export const inscreverNegocioSchema = z
  .object({ deal_id: z.string().uuid(), contact_id: z.string().uuid().optional() })
  .strict();

export const listarCadenciasSchema = z.object({
  status: z.enum(["rascunho", "ativa", "pausada"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
