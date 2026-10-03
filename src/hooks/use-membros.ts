"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { comHandles, type Membro, type MembroComHandle } from "@/lib/mencoes";

// Uma busca só por sessão da página; todos os componentes reaproveitam.
let cache: Promise<Membro[]> | null = null;

function carregar(): Promise<Membro[]> {
  cache ??= Promise.resolve(createClient().from("profiles").select("user_id,full_name,email")).then(({ data, error }) => {
    if (error) {
      cache = null; // tenta de novo na próxima montagem
      return [];
    }
    return (data ?? []) as Membro[];
  });
  return cache;
}

/** Membros da conta (para @menções), já com o handle de cada um. */
export function useMembros(): MembroComHandle[] {
  const [membros, setMembros] = useState<Membro[]>([]);
  useEffect(() => {
    let vivo = true;
    void carregar().then((m) => vivo && setMembros(m));
    return () => {
      vivo = false;
    };
  }, []);
  return useMemo(() => comHandles(membros), [membros]);
}
