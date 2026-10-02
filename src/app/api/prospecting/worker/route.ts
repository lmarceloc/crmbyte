import { supabaseAdmin } from "@/lib/automations/admin-client";
import { autorizaCron } from "@/lib/cron-auth";
import { processarProspeccao } from "@/lib/prospecting/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function tick(request: Request) {
  if (!autorizaCron(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    return Response.json(await processarProspeccao(supabaseAdmin()));
  } catch (e) {
    console.error("[prospecting-worker]", e);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
export const GET = tick;
export const POST = tick;
