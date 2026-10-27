import { supabaseAdmin } from "@/lib/automations/admin-client";
import { json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { testarPorta } from "@/lib/email/teste-de-rede";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de rede das caixas SMTP da conta (admin+): de dentro da Cloudflare,
 * tenta abrir conexão com os servidores SMTP (587 e 465) e IMAP (993) cadastrados
 * e devolve o resultado com horário, para mandar ao suporte do provedor.
 * Só testa hosts das próprias caixas da conta (nada de host arbitrário).
 */
export async function GET() {
  try {
    const ctx = await requireRole("admin");
    // email_mailboxes é só service role: cliente admin, sempre filtrando pela conta
    const { data, error } = await supabaseAdmin()
      .from("email_mailboxes")
      .select("email,provedor,smtp_host,imap_host")
      .eq("account_id", ctx.accountId);
    if (error) throw error;

    const alvos = new Map<string, { host: string; porta: number }>();
    for (const c of data ?? []) {
      if (c.provedor === "microsoft") continue;
      for (const porta of [587, 465]) if (c.smtp_host) alvos.set(`${c.smtp_host}:${porta}`, { host: c.smtp_host, porta });
      if (c.imap_host) alvos.set(`${c.imap_host}:993`, { host: c.imap_host, porta: 993 });
    }

    // IP de saída das requisições HTTP do Worker (o de socket costuma ser da mesma faixa)
    const trace = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(5000) })
      .then((r) => r.text())
      .catch(() => "");
    const campo = (k: string) => trace.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? null;

    const testes = [];
    for (const { host, porta } of [...alvos.values()].slice(0, 6)) testes.push(await testarPorta(host, porta));

    const agora = new Date();
    return json({
      quando_utc: agora.toISOString(),
      quando_brasilia: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      origem: { rede: "Cloudflare Workers", ip_de_saida_http: campo("ip"), datacenter: campo("colo") },
      caixas: (data ?? []).map((c) => c.email),
      testes,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
