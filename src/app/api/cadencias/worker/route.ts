import { supabaseAdmin } from "@/lib/automations/admin-client";
import { autorizaCron } from "@/lib/cron-auth";
import { processarCadencias } from "@/lib/cadencias/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick(request: Request) {
  if (!autorizaCron(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    return Response.json(await processarCadencias(supabaseAdmin()));
  } catch (e) {
    console.error("[cadencia-worker]", e);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
export const GET = tick;
export const POST = tick;
