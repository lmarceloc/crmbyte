import { z } from "zod";

// Espelha os CHECKs de 032_tarefas.sql.
export const TIPOS_DE_TAREFA = [
  "retornar_ligacao",
  "ligacao",
  "email",
  "whatsapp",
  "reuniao",
  "outra",
] as const;
export type TipoDeTarefa = (typeof TIPOS_DE_TAREFA)[number];
export type StatusDaTarefa = "pendente" | "concluida";

export const ROTULO_TIPO_TAREFA: Record<TipoDeTarefa, string> = {
  retornar_ligacao: "Retornar ligação",
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  outra: "Outra",
};

export interface Tarefa {
  id: string;
  account_id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoDeTarefa;
  status: StatusDaTarefa;
  contact_id: string | null;
  deal_id: string | null;
  enrollment_id: string | null;
  origem: "manual" | "cadencia";
  responsavel_id: string | null;
  criada_por: string | null;
  prazo_em: string | null;
  concluida_em: string | null;
  vista_em: string | null;
  created_at: string;
  contacts?: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  deals?: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
}

/** Colunas lidas nas listagens (com contato/negócio embutidos). */
export const COLUNAS_DA_TAREFA =
  "id,account_id,titulo,descricao,tipo,status,contact_id,deal_id,enrollment_id,origem,responsavel_id,criada_por,prazo_em,concluida_em,vista_em,created_at,contacts(id,name),deals(id,title)";

export const criarTarefaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(300),
    descricao: z.string().trim().max(2000).nullish(),
    tipo: z.enum(TIPOS_DE_TAREFA).default("outra"),
    contact_id: z.string().uuid().nullish(),
    deal_id: z.string().uuid().nullish(),
    responsavel_id: z.string().uuid().nullish(),
    prazo_em: z.string().datetime({ offset: true }).nullish(),
  })
  .strict();

export const editarTarefaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(300).optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    tipo: z.enum(TIPOS_DE_TAREFA).optional(),
    prazo_em: z.string().datetime({ offset: true }).nullable().optional(),
    responsavel_id: z.string().uuid().nullable().optional(),
    status: z.enum(["pendente", "concluida"]).optional(),
    vista: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar." });

export type SituacaoDoPrazo = "atrasada" | "hoje" | "futura" | "sem_prazo";

export function situacaoDoPrazo(prazoEm: string | null, agora = new Date()): SituacaoDoPrazo {
  if (!prazoEm) return "sem_prazo";
  const prazo = new Date(prazoEm);
  if (prazo.getTime() < agora.getTime()) return "atrasada";
  const fimDoDia = new Date(agora);
  fimDoDia.setHours(23, 59, 59, 999);
  return prazo.getTime() <= fimDoDia.getTime() ? "hoje" : "futura";
}

export function umRegistro<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
