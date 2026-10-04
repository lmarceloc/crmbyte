import type { Deal } from "@/types";

/** Filtro de dono: todos, sem dono, ou o `profiles.id` de um membro. */
export type FiltroDono = "todos" | "sem_dono" | string;

/** Minúsculas e sem acento, para "joao" achar "João". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filtrarNegocios(
  deals: Deal[],
  { busca, dono }: { busca: string; dono: FiltroDono },
): Deal[] {
  // Cada palavra precisa aparecer no nome, em qualquer ordem
  // ("gestao trafego" acha "Gestão de tráfego").
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  return deals.filter((d) => {
    if (dono === "sem_dono" && d.assigned_to) return false;
    if (dono !== "todos" && dono !== "sem_dono" && d.assigned_to !== dono) return false;
    if (palavras.length > 0) {
      const titulo = normalizar(d.title ?? "");
      if (!palavras.every((p) => titulo.includes(p))) return false;
    }
    return true;
  });
}
