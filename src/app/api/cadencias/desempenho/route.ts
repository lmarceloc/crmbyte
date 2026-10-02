import { z } from "zod";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

const query = z.object({
  cadence_id: z.string().uuid().optional(),
  por: z.string().uuid().optional(),
  de: z.string().date().optional(), // YYYY-MM-DD, inclusivo
  ate: z.string().date().optional(), // YYYY-MM-DD, inclusivo
});

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const sp = Object.fromEntries(
      [...new URL(request.url).searchParams].filter(([, v]) => v !== ""),
    );
    const q = query.safeParse(sp);
    if (!q.success) return validationFailed(q.error);

    // `ate` é inclusivo: filtra por created_at < dia seguinte.
    let ate: string | null = null;
    if (q.data.ate) {
      const d = new Date(`${q.data.ate}T00:00:00-03:00`);
      d.setUTCDate(d.getUTCDate() + 1);
      ate = d.toISOString();
    }
    // Sessão do usuário: a RLS decide o que ele enxerga.
    const { data, error } = await ctx.supabase.rpc("fn_cadencia_desempenho", {
      p_cadence: q.data.cadence_id ?? null,
      p_de: q.data.de ? new Date(`${q.data.de}T00:00:00-03:00`).toISOString() : null,
      p_ate: ate,
      p_por: q.data.por ?? null,
    });
    if (error) return fail("db_error", error.message, 500);
    return json({ desempenho: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}
