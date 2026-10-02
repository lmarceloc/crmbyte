// Quando um lead da Prospecção B2B pode ir para o funil — uma regra só, lida
// pela tela (botão "Importar") e pelo servidor (a importação de verdade).
import { MSG_PEDIU_PARA_SAIR } from "./errors";

export const MSG_AINDA_PROCURANDO_EMAIL =
  "O e-mail deste lead ainda está sendo procurado. Tente de novo em instantes.";

interface CandidatoB2b {
  status: string;
  contact_id: string | null;
  error: string | null;
}

export type AvaliacaoB2b =
  | { ok: true; precisaCriarContato: boolean }
  | { ok: false; motivo: string };

/**
 * Lead com e-mail verificado já tem contato (`contact_id`): importa direto.
 *
 * Lead que terminou SEM e-mail verificado (`skipped`: não achou, não passou na
 * verificação, sem domínio, teto de busca; `failed`: erro do provedor) ainda tem
 * nome, cargo, empresa e LinkedIn. Quem escolhe "Importar" decidiu trabalhá-lo
 * por outro canal, então o contato nasce na importação.
 *
 * Fora disso: `new` ainda está na fila de revelação (criar contato agora geraria
 * um segundo quando o e-mail chegar) e quem pediu para sair nunca entra.
 */
export function avaliarImportacaoB2b(c: CandidatoB2b): AvaliacaoB2b {
  if (c.contact_id) return { ok: true, precisaCriarContato: false };
  if (c.error === MSG_PEDIU_PARA_SAIR) return { ok: false, motivo: MSG_PEDIU_PARA_SAIR };
  if (c.status === "skipped" || c.status === "failed") return { ok: true, precisaCriarContato: true };
  if (c.status === "new") return { ok: false, motivo: MSG_AINDA_PROCURANDO_EMAIL };
  return { ok: false, motivo: "Este lead ainda não pode ser importado." };
}

/** O botão "Importar" aparece quando o lead ainda não está no funil e a avaliação deixa. */
export function leadB2bImportavel(c: CandidatoB2b & { deal_id: string | null }): boolean {
  return !c.deal_id && avaliarImportacaoB2b(c).ok;
}
