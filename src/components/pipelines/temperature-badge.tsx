"use client";

import { Ban, Flame, Snowflake, Thermometer, Zap } from "lucide-react";
import type { DealTemperature } from "@/types";
import { TEMPERATURAS } from "@/lib/deals/temperature";

const ICONES = { Ban, Snowflake, Thermometer, Flame, Zap } as const;

export function TemperatureIcon({
  nome,
  className,
}: {
  nome: (typeof TEMPERATURAS)[number]["icone"];
  className?: string;
}) {
  const Icon = ICONES[nome];
  return <Icon className={className} aria-hidden />;
}

/** Selo compacto (ícone + rótulo) usado no card do negócio. */
export function TemperatureBadge({ value }: { value?: DealTemperature | null }) {
  const t = TEMPERATURAS.find((x) => x.valor === (value ?? "frio")) ?? TEMPERATURAS[1];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${t.classe}`}
    >
      <TemperatureIcon nome={t.icone} className="h-3 w-3" />
      {t.rotulo}
    </span>
  );
}

/** Seletor de temperatura (um botão por opção, com ícone). */
export function TemperaturePicker({
  value,
  onChange,
}: {
  value: DealTemperature;
  onChange: (v: DealTemperature) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Temperatura" className="flex flex-wrap gap-1.5">
      {TEMPERATURAS.map((t) => {
        const ativo = t.valor === value;
        return (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(t.valor)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              ativo
                ? `${t.classe} ring-1 ring-current`
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <TemperatureIcon nome={t.icone} className="h-3.5 w-3.5" />
            {t.rotulo}
          </button>
        );
      })}
    </div>
  );
}
