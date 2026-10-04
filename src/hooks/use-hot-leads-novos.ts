"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EVENTO_HOT_LEADS_VISTOS } from "@/lib/cadencias/hot-leads";

interface Resposta {
  novos: number;
  ultimo: {
    enrollment_id: string;
    deal_title: string | null;
    contact_name: string | null;
    aberturas: number;
  } | null;
}

const INTERVALO_MS = 60_000;

/**
 * Leads quentes com abertura desde a última visita à página. Alimenta o selo
 * do menu lateral e dispara um toast quando um lead novo aparece enquanto o
 * usuário está no app (não na primeira carga). Sem realtime nesta tabela:
 * consulta a cada minuto e ao voltar para a aba.
 */
export function useHotLeadsNovos(ativo: boolean): number {
  const router = useRouter();
  const [novos, setNovos] = useState(0);
  const ultimoVisto = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;

    const carregar = async () => {
      try {
        const r = await fetch("/api/hot-leads/novos", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as Resposta;
        if (cancelado) return;
        setNovos(d.novos);

        const atual = d.ultimo?.enrollment_id ?? null;
        const primeiraCarga = ultimoVisto.current === undefined;
        const naPagina = window.location.pathname.startsWith("/hot-leads");
        if (!primeiraCarga && atual && atual !== ultimoVisto.current && !naPagina && d.ultimo) {
          const quem = d.ultimo.deal_title ?? d.ultimo.contact_name ?? "Um lead";
          toast(`🔥 Lead quente: ${quem}`, {
            description: `Abriu o e-mail ${d.ultimo.aberturas}x.`,
            action: { label: "Ver", onClick: () => router.push("/hot-leads") },
          });
        }
        ultimoVisto.current = atual;
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
    };

    const t = setTimeout(() => void carregar(), 0);
    const intervalo = setInterval(() => void carregar(), INTERVALO_MS);
    const aoFocar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    const aoVer = () => setNovos(0);
    document.addEventListener("visibilitychange", aoFocar);
    window.addEventListener(EVENTO_HOT_LEADS_VISTOS, aoVer);
    return () => {
      cancelado = true;
      clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.removeEventListener(EVENTO_HOT_LEADS_VISTOS, aoVer);
    };
  }, [ativo, router]);

  return ativo ? novos : 0;
}
