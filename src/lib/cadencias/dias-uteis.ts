// Dias úteis em UTC (sábado/domingo + feriados nacionais fixos do Brasil).
// Preserva hora/min/seg. Feriados móveis (Carnaval, Sexta-feira Santa, Corpus
// Christi) entram na tabela por ano; fora dela só os fixos contam.

const FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
const MOVEIS: Record<number, string[]> = {
  2026: ["02-16", "02-17", "04-03", "06-04"],
  2027: ["02-08", "02-09", "03-26", "05-27"],
  2028: ["02-28", "02-29", "04-14", "06-15"],
  2029: ["02-12", "02-13", "03-30", "05-31"],
  2030: ["03-04", "03-05", "04-19", "06-20"],
};

function chave(d: Date): string {
  return d.toISOString().slice(5, 10);
}

export function eFeriado(d: Date): boolean {
  const k = chave(d);
  return FIXOS.includes(k) || (MOVEIS[d.getUTCFullYear()]?.includes(k) ?? false);
}

export function eDiaUtil(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !eFeriado(d);
}

export function avancarDiasUteis(de: Date, dias: number): Date {
  const d = new Date(de.getTime());
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (eDiaUtil(d)) restantes--;
  }
  return d;
}
