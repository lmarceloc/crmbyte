"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Mencao {
  id: string;
  note_id: string;
  contact_id: string | null;
  deal_id: string | null;
  autor_nome: string | null;
  trecho: string;
  vista_em: string | null;
  created_at: string;
}

const COLUNAS = "id,note_id,contact_id,deal_id,autor_nome,trecho,vista_em,created_at";

/** Menções recebidas (as RLS já limitam a quem foi mencionado), com realtime. */
export function useMencoes() {
  const [mencoes, setMencoes] = useState<Mencao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const versao = useRef(0);
  const canal = useId();

  const recarregar = useCallback(async () => {
    const minha = ++versao.current;
    const { data, error } = await createClient()
      .from("nota_mencoes")
      .select(COLUNAS)
      .order("created_at", { ascending: false })
      .limit(20);
    if (minha !== versao.current) return;
    if (!error) setMencoes((data ?? []) as Mencao[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const t = setTimeout(() => void recarregar(), 0);
    const channel = supabase
      .channel(`mencoes-${canal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nota_mencoes" }, () => void recarregar())
      .subscribe();
    const intervalo = setInterval(() => void recarregar(), 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(intervalo);
      void supabase.removeChannel(channel);
    };
  }, [canal, recarregar]);

  const marcarVista = useCallback(async (id: string) => {
    const agora = new Date().toISOString();
    setMencoes((l) => l.map((m) => (m.id === id && !m.vista_em ? { ...m, vista_em: agora } : m)));
    await createClient().from("nota_mencoes").update({ vista_em: agora }).eq("id", id).is("vista_em", null);
  }, []);

  const marcarTodasVistas = useCallback(async () => {
    const agora = new Date().toISOString();
    setMencoes((l) => l.map((m) => (m.vista_em ? m : { ...m, vista_em: agora })));
    await createClient().from("nota_mencoes").update({ vista_em: agora }).is("vista_em", null);
  }, []);

  return { mencoes, carregando, marcarVista, marcarTodasVistas };
}
