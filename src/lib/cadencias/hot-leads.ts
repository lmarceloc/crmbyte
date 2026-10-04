/**
 * Lead quente "novo" = teve abertura depois da última vez que o usuário
 * abriu a página de leads quentes. Quem nunca abriu a página vê todos
 * como novos.
 */
export function ehLeadQuenteNovo(
  ultimaAberturaEm: string | null | undefined,
  vistosEm: string | null | undefined,
): boolean {
  if (!ultimaAberturaEm) return false;
  if (!vistosEm) return true;
  return new Date(ultimaAberturaEm).getTime() > new Date(vistosEm).getTime();
}

/** Evento de janela disparado quando a página marca os leads como vistos. */
export const EVENTO_HOT_LEADS_VISTOS = "hot-leads:vistos";
