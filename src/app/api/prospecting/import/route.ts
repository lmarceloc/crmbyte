import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, validationFailed } from "@/lib/api-utils";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { importarCandidatos } from "@/lib/prospecting/import";
import { ProspectingError } from "@/lib/prospecting/errors";
import { importSchema } from "@/lib/prospecting/schemas";
import { mensagemGenerica } from "@/lib/prospecting/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const corpo = importSchema.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return validationFailed(corpo.error);
    const r = await importarCandidatos(supabaseAdmin(), {
      accountId: ctx.accountId, // sempre da sessão, nunca do corpo
      userId: ctx.userId,
      kind: corpo.data.kind,
      candidateIds: corpo.data.candidate_ids,
      pipelineId: corpo.data.pipeline_id,
      stageId: corpo.data.stage_id,
      legalBasisRef: corpo.data.legal_basis_ref,
    });
    return json(r);
  } catch (e) {
    if (e instanceof ProspectingError) return fail("prospecting_unavailable", e.message, e.status);
    if (e instanceof Error && e.name.endsWith("Error") && "status" in e) return toErrorResponse(e);
    console.error("[prospecting.import]", e);
    return fail("prospecting_unavailable", mensagemGenerica, 500);
  }
}
