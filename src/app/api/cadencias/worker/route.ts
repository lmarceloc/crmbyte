import { supabaseAdmin } from "@/lib/automations/admin-client";
import { autorizaCron } from "@/lib/cron-auth";
import { processarCadencias } from "@/lib/cadencias/worker";
import { processarResumosSemanais } from "@/lib/resumo-semanal/envio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick(request: Request) {
  if (!autorizaCron(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const admin = supabaseAdmin();
    const resultado = await processarCadencias(admin);
    // resumo semanal pega carona no cron da cadência (segunda 8h); falha aqui não derruba o tick
    const resumosSemanais = await processarResumosSemanais(admin).catch((e) => {
      console.error("[resumo-semanal]", e);
      return 0;
    });
    return Response.json({ ...resultado, resumosSemanais });
  } catch (e) {
    console.error("[cadencia-worker]", e);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
export const GET = tick;
export const POST = tick;
