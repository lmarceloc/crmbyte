"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Tarefa } from "@/lib/tarefas/tipos";

export interface FiltroDeTarefas {
  status?: "pendente" | "concluida";
  escopo?: "minhas" | "todas";
  contactId?: string;
  dealId?: string;
  /** Desligado = não busca nem assina o realtime. */
  ativo?: boolean;
}

interface Resposta {
  tarefas: Tarefa[];
  nao_vistas: number;
  usuario_id: string;
}

/**
 * Lista de tarefas com atualização em tempo real (postgres_changes) e
 * conclusão otimista. `alternar` marca/desmarca e reverte se a API falhar.
 */
export function useTarefas({ status, escopo = "minhas", contactId, dealId, ativo = true }: FiltroDeTarefas = {}) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [naoVistas, setNaoVistas] = useState(0);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef(0);
  const canal = useId();

  const recarregar = useCallback(async () => {
    const minha = ++versao.current;
    const sp = new URLSearchParams({ escopo });
    if (status) sp.set("status", status);
    if (contactId) sp.set("contact_id", contactId);
    if (dealId) sp.set("deal_id", dealId);
    try {
      const r = await fetch(`/api/tarefas?${sp}`, { cache: "no-store" });
      const d = (await r.json()) as Resposta & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Falha ao carregar as tarefas.");
      if (minha !== versao.current) return;
      setTarefas(d.tarefas);
      setNaoVistas(d.nao_vistas);
      setUsuarioId(d.usuario_id);
      setErro(null);
    } catch (e) {
      if (minha === versao.current) setErro(e instanceof Error ? e.message : "Falha ao carregar as tarefas.");
    } finally {
      if (minha === versao.current) setCarregando(false);
    }
  }, [status, escopo, contactId, dealId]);

  useEffect(() => {
    if (!ativo) return;
    // carga inicial fora do corpo síncrono do efeito
    const t = setTimeout(() => void recarregar(), 0);
    return () => clearTimeout(t);
  }, [ativo, recarregar]);

  useEffect(() => {
    if (!ativo) return;
    const supabase = createClient();
    let pendente: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`tarefas-${canal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, () => {
        // junta rajadas de eventos (ex.: o worker criando várias tarefas)
        if (pendente) clearTimeout(pendente);
        pendente = setTimeout(() => void recarregar(), 300);
      })
      .subscribe();
    // rede de segurança caso o realtime esteja indisponível
    const intervalo = setInterval(() => void recarregar(), 60_000);
    return () => {
      if (pendente) clearTimeout(pendente);
      clearInterval(intervalo);
      void supabase.removeChannel(channel);
    };
  }, [ativo, canal, recarregar]);

  const atualizar = useCallback(
    async (id: string, corpo: Record<string, unknown>, otimista?: Partial<Tarefa>) => {
      let anterior: Tarefa | undefined;
      if (otimista) {
        setTarefas((l) =>
          l.map((t) => {
            if (t.id !== id) return t;
            anterior = t;
            return { ...t, ...otimista };
          }),
        );
      }
      try {
        const r = await fetch(`/api/tarefas/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const d = (await r.json()) as { tarefa?: Tarefa; error?: string };
        if (!r.ok || !d.tarefa) throw new Error(d.error ?? "Falha ao atualizar a tarefa.");
        const nova = d.tarefa;
        setTarefas((l) => l.map((t) => (t.id === id ? nova : t)));
        return nova;
      } catch (e) {
        const prev = anterior;
        if (prev) setTarefas((l) => l.map((t) => (t.id === id ? prev : t)));
        toast.error(e instanceof Error ? e.message : "Falha ao atualizar a tarefa.");
        return null;
      }
    },
    [],
  );

  const alternar = useCallback(
    (t: Tarefa) => {
      const concluir = t.status === "pendente";
      return atualizar(
        t.id,
        { status: concluir ? "concluida" : "pendente" },
        {
          status: concluir ? "concluida" : "pendente",
          concluida_em: concluir ? new Date().toISOString() : null,
        },
      );
    },
    [atualizar],
  );

  const marcarComoVistas = useCallback(async () => {
    setNaoVistas(0);
    await fetch("/api/tarefas/vistas", { method: "POST" }).catch(() => {});
  }, []);

  return { tarefas, naoVistas, usuarioId, carregando, erro, recarregar, alternar, atualizar, marcarComoVistas };
}
