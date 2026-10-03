import { differenceInCalendarDays } from "date-fns";

/** A partir de quantos dias parado na etapa o indicador fica âmbar / vermelho. */
export const DIAS_ALERTA = 7;
export const DIAS_CRITICO = 14;

/** Dias de calendário desde que o negócio entrou na etapa atual (nunca negativo). */
export function diasNaEtapa(desde: string | null | undefined, agora: Date = new Date()): number | null {
  if (!desde) return null;
  const inicio = new Date(desde);
  if (Number.isNaN(inicio.getTime())) return null;
  return Math.max(0, differenceInCalendarDays(agora, inicio));
}

export function rotuloDiasNaEtapa(dias: number): string {
  if (dias === 0) return "Hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

export function nivelDiasNaEtapa(dias: number): "normal" | "alerta" | "critico" {
  if (dias >= DIAS_CRITICO) return "critico";
  if (dias >= DIAS_ALERTA) return "alerta";
  return "normal";
}
