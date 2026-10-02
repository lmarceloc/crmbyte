// Janela de envio: o worker só envia dentro de dias/horário no fuso da cadência.
import type { ConfiguracaoDaCadencia, DiaDaSemana } from "./tipos";

const DIAS: DiaDaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partesNoFuso(d: Date, fuso: string): { dia: DiaDaSemana; minutos: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    dia: DIAS[SEMANA[p.weekday] ?? 0],
    minutos: Number(p.hour) * 60 + Number(p.minute),
  };
}

const paraMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function dentroDaJanela(agora: Date, cfg: ConfiguracaoDaCadencia): boolean {
  const { dia, minutos } = partesNoFuso(agora, cfg.fuso);
  if (!cfg.janela.dias.includes(dia)) return false;
  return minutos >= paraMinutos(cfg.janela.inicio) && minutos < paraMinutos(cfg.janela.fim);
}
