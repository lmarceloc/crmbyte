// Empresa e negócio compartilham nome, site e LinkedIn: a fonte é a empresa
// (`companies`), e o negócio só a exibe. O `deals.linkedin_url` (027) é legado e
// não é mais editado — só aparece quando difere do LinkedIn da empresa.

import { normalizarUrl } from "@/lib/url";

export interface DadosDaEmpresa {
  website?: string | null;
  linkedin_url?: string | null;
}

/** Site e LinkedIn da empresa, prontos para virar link (só http/https) ou null. */
export function linksDaEmpresa(empresa: DadosDaEmpresa | null | undefined): {
  site: string | null;
  linkedin: string | null;
} {
  return { site: normalizarUrl(empresa?.website), linkedin: normalizarUrl(empresa?.linkedin_url) };
}

/** LinkedIn gravado no próprio negócio, se existir e não for o mesmo da empresa. */
export function linkedinSoDoNegocio(
  linkedinDoNegocio: string | null | undefined,
  empresa: DadosDaEmpresa | null | undefined,
): string | null {
  const doNegocio = normalizarUrl(linkedinDoNegocio);
  if (!doNegocio) return null;
  return doNegocio === linksDaEmpresa(empresa).linkedin ? null : doNegocio;
}

/** Nome do negócio sugerido ao escolher a empresa: o dela, sem sobrescrever o que já foi digitado. */
export function tituloSugerido(tituloAtual: string, nomeDaEmpresa: string | null | undefined): string {
  if (tituloAtual.trim()) return tituloAtual;
  return nomeDaEmpresa?.trim() ?? "";
}
