"use client";

import { useEffect, useRef } from "react";
import type { Deal, PipelineStage } from "@/types";
import { Building2, Calendar, Check, Globe, Hourglass, Link2, Pencil, Users, X } from "lucide-react";
import { linksDaEmpresa } from "@/lib/deals/dados-da-empresa";
import { TemperatureBadge } from "./temperature-badge";
import { formatCurrency } from "@/lib/currency";
import { useDetailPanel } from "@/components/detail/detail-panel-provider";
import { diasNaEtapa, nivelDiasNaEtapa, rotuloDiasNaEtapa } from "@/lib/deals/dias-na-etapa";

const CLASSE_DIAS_NA_ETAPA = {
  normal: "border-border bg-background/60 text-muted-foreground",
  alerta: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  critico: "border-red-500/40 bg-red-500/10 text-red-400",
} as const;

// Só para negócios em aberto: ganho/perdido já saiu do funil.
function DiasNaEtapaBadge({ deal }: { deal: Deal }) {
  if ((deal.status ?? "open") !== "open") return null;
  const dias = diasNaEtapa(deal.stage_entered_at);
  if (dias === null) return null;
  const desde = new Date(deal.stage_entered_at!).toLocaleDateString("pt-BR");
  return (
    <span
      title={`Nesta etapa desde ${desde}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${CLASSE_DIAS_NA_ETAPA[nivelDiasNaEtapa(dias)]}`}
    >
      <Hourglass className="h-3 w-3" />
      {rotuloDiasNaEtapa(dias)}
    </span>
  );
}

// span (não <a>): o cartão inteiro já é um <button>
function LinkDaEmpresa({
  url,
  titulo,
  children,
}: {
  url: string;
  titulo: string;
  children: React.ReactNode;
}) {
  const abrir = () => window.open(url, "_blank", "noopener,noreferrer");
  return (
    <span
      role="link"
      tabIndex={0}
      title={titulo}
      aria-label={titulo}
      className="shrink-0 rounded text-muted-foreground hover:text-primary focus:text-primary"
      onClick={(e) => {
        e.stopPropagation();
        abrir();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          abrir();
        }
      }}
    >
      {children}
    </span>
  );
}

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
  /** Negócio escolhido no painel do Analisar Deals. */
  destacado?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

export function DealCard({ deal, stage, onEdit, isOverlay, destacado }: DealCardProps) {
  const { open: abrirPainel } = useDetailPanel();
  const ref = useRef<HTMLButtonElement>(null);
  // um negócio escolhido no painel do Analisar Deals rola até aparecer e ganha um anel
  useEffect(() => {
    if (destacado) ref.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [destacado]);
  const contactLabel = deal.contact?.name || deal.contact?.phone || "No contact";
  const assigneeLabel = deal.assignee?.full_name || null;
  const { site, linkedin } = linksDaEmpresa(deal.company);

  return (
    <button
      ref={ref}
      type="button"
      data-deal-id={deal.id}
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        abrirPainel({ type: "deal", id: deal.id });
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3 text-left shadow-sm transition-all ${
        destacado ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          <span className="hover:text-primary">
            {deal.title}
          </span>
        </h4>
        {!isOverlay && (
          // span (não botão): o cartão inteiro já é um <button>
          <span
            role="button"
            tabIndex={0}
            title="Editar negócio"
            aria-label="Editar negócio"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(deal);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onEdit(deal);
              }
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </span>
        )}
        {deal.status === "won" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" />
            Won
          </span>
        )}
        {deal.status === "lost" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            Lost
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {deal.company?.name && (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.company.name}</span>
          </span>
        )}
        {!isOverlay && site && (
          <LinkDaEmpresa url={site} titulo="Abrir site da empresa">
            <Globe className="h-3 w-3" />
          </LinkDaEmpresa>
        )}
        {!isOverlay && linkedin && (
          <LinkDaEmpresa url={linkedin} titulo="Abrir LinkedIn da empresa">
            <Link2 className="h-3 w-3" />
          </LinkDaEmpresa>
        )}
        <TemperatureBadge value={deal.temperature} />
        <DiasNaEtapaBadge deal={deal} />
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {initials(deal.contact?.name, deal.contact?.phone)}
        </span>
        <span className="truncate text-xs text-muted-foreground">{contactLabel}</span>
        {(deal.deal_contacts?.length ?? 0) > 1 && (
          <span
            title={`${deal.deal_contacts?.length} contatos neste negócio`}
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
          >
            <Users className="h-3 w-3" />
            {deal.deal_contacts?.length}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.expected_close_date && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>

      {assigneeLabel && (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={assigneeLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeLabel)}
          </span>
        </div>
      )}
    </button>
  );
}
