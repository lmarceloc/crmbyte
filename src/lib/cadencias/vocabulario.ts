// Tuplas `as const` espelhando os CHECKs de 024_email_cadences.sql.
export const STATUS_DA_CADENCIA = ["rascunho", "ativa", "pausada"] as const;
export const STATUS_DA_INSCRICAO = ["ativa", "concluida", "parada"] as const;
export const ORIGENS_DA_INSCRICAO = ["manual", "tag"] as const;
export const MOTIVOS_DE_PARADA = [
  "respondeu",
  "bounce",
  "descadastro",
  "ganho_ou_perdido",
  "manual",
  "sem_email",
  "falha",
] as const;
export const TIPOS_DE_EVENTO_DA_CADENCIA = [
  "inscrito",
  "reinscrito",
  "email_enviado",
  "email_falhou",
  "aberto",
  "clicado",
  "descadastrou",
  "ramo_sim",
  "ramo_nao",
  "tarefa_criada",
  "parada",
  "concluida",
  "limite_diario_atingido",
  "fora_da_janela",
] as const;

export type StatusDaInscricao = (typeof STATUS_DA_INSCRICAO)[number];
export type MotivoDeParada = (typeof MOTIVOS_DE_PARADA)[number];
export type TipoDeEventoDaCadencia = (typeof TIPOS_DE_EVENTO_DA_CADENCIA)[number];

/** "Quente" = abriu o e-mail de uma cadência pelo menos N vezes. */
export const LIMIAR_LEAD_QUENTE = 3;
