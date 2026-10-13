// Semana do resumo, no horário de Brasília (UTC-3 fixo; sem horário de verão desde 2019).
const OFFSET_MS = 3 * 60 * 60_000;
const DIA_MS = 24 * 60 * 60_000;

/** Segunda-feira, 8h (Brasília): a partir daí o resumo da semana anterior pode sair. */
export const HORA_DO_ENVIO = 8;

export interface Semana {
  /** Segunda 00:00 da semana resumida (instante UTC). */
  inicio: Date;
  /** Segunda 00:00 seguinte (exclusivo). */
  fim: Date;
  /** "AAAA-MM-DD" da segunda resumida — chave de idempotência. */
  chave: string;
}

/** Semana fechada mais recente em relação a `agora` (a que termina na última segunda 00:00). */
export function semanaAnterior(agora: Date): Semana {
  const local = new Date(agora.getTime() - OFFSET_MS); // relógio de Brasília lido em UTC
  const diasDesdeSegunda = (local.getUTCDay() + 6) % 7;
  const segundaLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - diasDesdeSegunda * DIA_MS;
  const fim = new Date(segundaLocal + OFFSET_MS);
  const inicio = new Date(fim.getTime() - 7 * DIA_MS);
  return { inicio, fim, chave: new Date(segundaLocal - 7 * DIA_MS).toISOString().slice(0, 10) };
}

/** Já passou da segunda 8h desta semana? (antes disso o resumo da semana anterior ainda não sai) */
export function horaDeEnviar(agora: Date): boolean {
  const { fim } = semanaAnterior(agora);
  return agora.getTime() >= fim.getTime() + HORA_DO_ENVIO * 60 * 60_000;
}

export function formatarDia(d: Date): string {
  return new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10).split("-").reverse().join("/");
}
