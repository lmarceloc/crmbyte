"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { FiltroDono } from "@/lib/deals/filtro";

export interface MembroDoFunil {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PipelineFiltersProps {
  busca: string;
  onBuscaChange: (v: string) => void;
  dono: FiltroDono;
  onDonoChange: (v: FiltroDono) => void;
  membros: MembroDoFunil[];
  meuPerfilId: string | null;
  total: number;
  visiveis: number;
}

const nomeDoMembro = (m: MembroDoFunil) => m.full_name || m.email || "Sem nome";

export function PipelineFilters({
  busca,
  onBuscaChange,
  dono,
  onDonoChange,
  membros,
  meuPerfilId,
  total,
  visiveis,
}: PipelineFiltersProps) {
  const buscaRef = useRef<HTMLInputElement>(null);

  // Atalho "/" foca a busca (fora de campos de texto).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      buscaRef.current?.focus();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const rotuloDono =
    dono === "todos"
      ? "Proprietário do negócio"
      : dono === "sem_dono"
        ? "Sem proprietário"
        : dono === meuPerfilId
          ? "Meus negócios"
          : nomeDoMembro(membros.find((m) => m.id === dono) ?? { id: "", full_name: null, email: null });

  const filtrando = dono !== "todos" || busca.trim() !== "";
  const opcoes: { valor: FiltroDono; rotulo: string }[] = [
    { valor: "todos", rotulo: "Todos" },
    ...(meuPerfilId ? [{ valor: meuPerfilId, rotulo: "Meus negócios" }] : []),
    { valor: "sem_dono", rotulo: "Sem proprietário" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={buscaRef}
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onBuscaChange("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Pesquisar ( / )"
          aria-label="Pesquisar negócio pelo nome"
          className="h-9 rounded-full border-border bg-card pl-9 pr-8 text-foreground placeholder:text-muted-foreground"
        />
        {busca && (
          <button
            type="button"
            onClick={() => onBuscaChange("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors data-[popup-open]:bg-muted ${
            dono === "todos"
              ? "border-border bg-card text-foreground hover:bg-muted"
              : "border-primary/40 bg-primary/10 text-primary"
          }`}
        >
          <UserRound className="h-4 w-4" />
          <span className="max-w-48 truncate">{rotuloDono}</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-64 overflow-y-auto border-border bg-popover text-popover-foreground"
        >
          {opcoes.map((o) => (
            <DropdownMenuItem key={o.valor} onClick={() => onDonoChange(o.valor)}>
              <Check className={`mr-2 h-3.5 w-3.5 ${dono === o.valor ? "opacity-100" : "opacity-0"}`} />
              {o.rotulo}
            </DropdownMenuItem>
          ))}
          {membros.length > 0 && <DropdownMenuSeparator className="bg-border" />}
          {membros.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => onDonoChange(m.id)}>
              <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${dono === m.id ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{nomeDoMembro(m)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {filtrando && (
        <>
          <span className="text-xs text-muted-foreground">
            {visiveis} de {total} negócio{total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              onBuscaChange("");
              onDonoChange("todos");
            }}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            Limpar filtros
          </button>
        </>
      )}
    </div>
  );
}
