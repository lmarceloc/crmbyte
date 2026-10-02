import type { DealTemperature } from "@/types";

/** Temperatura do negócio. O ícone (lucide-react) é resolvido pelo componente. */
export const TEMPERATURAS: {
  valor: DealTemperature;
  rotulo: string;
  icone: "Ban" | "Snowflake" | "Thermometer" | "Flame" | "Zap";
  classe: string;
}[] = [
  { valor: "sem_interesse", rotulo: "Sem interesse", icone: "Ban", classe: "border-border bg-muted text-muted-foreground" },
  { valor: "frio", rotulo: "Frio", icone: "Snowflake", classe: "border-sky-500/40 bg-sky-500/10 text-sky-500" },
  { valor: "morno", rotulo: "Morno", icone: "Thermometer", classe: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  { valor: "quente", rotulo: "Quente", icone: "Flame", classe: "border-orange-500/40 bg-orange-500/10 text-orange-500" },
  { valor: "quase_fechando", rotulo: "Quase fechando", icone: "Zap", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
];

export const rotuloTemperatura = (v: string | null | undefined) =>
  TEMPERATURAS.find((t) => t.valor === v)?.rotulo ?? "Frio";
