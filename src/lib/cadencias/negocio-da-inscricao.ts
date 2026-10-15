// Negócio criado a partir de um inscrito sem negócio ("Criar negócio").
//
// O contato entra na cadência sem poluir o pipeline; quando ele evolui, o
// vendedor cria o negócio — no funil/etapa pedidos, senão nos da cadência,
// senão no primeiro funil da conta, primeira etapa.
import { etapaInicial } from "@/lib/negocio-da-empresa";

export interface EscolhaDoFunil {
  pipelineId: string;
  stageId: string;
}

/**
 * @param pedido o que veio na requisição (pode faltar)
 * @param daCadencia `configuracao.negocio` da cadência
 * @param funis funis da conta, na ordem de criação, com as etapas de cada um
 * @returns o funil/etapa válidos, ou null se a conta não tem funil com etapa
 */
export function escolherFunilEEtapa(
  pedido: { pipelineId?: string | null; stageId?: string | null },
  daCadencia: { pipelineId: string | null; stageId: string | null },
  funis: { id: string; etapas: { id: string; position: number }[] }[],
): EscolhaDoFunil | null {
  const candidatos = [
    { p: pedido.pipelineId, s: pedido.stageId },
    { p: daCadencia.pipelineId, s: daCadencia.stageId },
    ...funis.map((f) => ({ p: f.id, s: null as string | null | undefined })),
  ];
  for (const c of candidatos) {
    const funil = c.p ? funis.find((f) => f.id === c.p) : undefined;
    if (!funil || funil.etapas.length === 0) continue;
    // etapa apagada ou de outro funil: cai na primeira etapa deste funil
    const stageId = c.s && funil.etapas.some((e) => e.id === c.s) ? c.s : etapaInicial(funil.etapas);
    return { pipelineId: funil.id, stageId };
  }
  return null;
}

/** "Contato — Empresa", ou só o que existir. */
export function tituloDoNegocio(contato: string | null | undefined, empresa: string | null | undefined): string {
  const partes = [contato?.trim(), empresa?.trim()].filter((x): x is string => !!x);
  return partes.join(" — ") || "Negócio da cadência";
}
