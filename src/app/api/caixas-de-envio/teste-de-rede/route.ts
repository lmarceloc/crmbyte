import { supabaseAdmin } from "@/lib/automations/admin-client";
import { json, toErrorResponse } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { ipDeSaidaPorSocket, testarPorta } from "@/lib/email/teste-de-rede";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de rede das caixas SMTP da conta (admin+): de dentro da Cloudflare,
 * tenta abrir conexão com os servidores SMTP (587 e 465) e IMAP (993) cadastrados
 * e devolve o resultado com horário, para mandar ao suporte do provedor — junto com
 * o IPv4 de saída dos sockets, que é o que aparece no firewall dele.
 * Testa só os hosts das caixas da conta mais uma lista fixa de comparação
 * (Umbler e Gmail) — nada de host arbitrário vindo da requisição.
 */
const COMPARACAO = [
  { provedor: "Umbler", host: "smtp.umbler.com", portas: [587, 465] },
  { provedor: "Umbler", host: "imap.umbler.com", portas: [993] },
  { provedor: "Gmail", host: "smtp.gmail.com", portas: [587, 465] },
  { provedor: "Gmail", host: "imap.gmail.com", portas: [993] },
];
export async function GET() {
  try {
    const ctx = await requireRole("admin");
    // email_mailboxes é só service role: cliente admin, sempre filtrando pela conta
    const { data, error } = await supabaseAdmin()
      .from("email_mailboxes")
      .select("email,provedor,smtp_host,imap_host")
      .eq("account_id", ctx.accountId);
    if (error) throw error;

    const alvos = new Map<string, { provedor: string; host: string; porta: number }>();
    for (const { provedor, host, portas } of COMPARACAO)
      for (const porta of portas) alvos.set(`${host}:${porta}`, { provedor, host, porta });
    for (const c of (data ?? []).slice(0, 5)) {
      if (c.provedor === "microsoft") continue;
      for (const porta of [587, 465])
        if (c.smtp_host) alvos.set(`${c.smtp_host}:${porta}`, { provedor: `caixa ${c.email}`, host: c.smtp_host, porta });
      if (c.imap_host) alvos.set(`${c.imap_host}:993`, { provedor: `caixa ${c.email}`, host: c.imap_host, porta: 993 });
    }

    // IP de saída das requisições HTTP do Worker (o de socket costuma ser da mesma faixa)
    const trace = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(5000) })
      .then((r) => r.text())
      .catch(() => "");
    const campo = (k: string) => trace.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? null;

    // IPv4 de saída dos sockets (o que o firewall do provedor de e-mail registra),
    // medido antes e depois dos testes: o Worker pode sair por IPs diferentes
    const ipv4Antes = await ipDeSaidaPorSocket();
    // em paralelo: a resposta volta em ~10 s mesmo com vários timeouts
    const testes = await Promise.all(
      [...alvos.values()].slice(0, 16).map(async ({ provedor, host, porta }) => ({
        provedor,
        ...(await testarPorta(host, porta)),
      })),
    );
    const ipv4Depois = await ipDeSaidaPorSocket();

    const agora = new Date();
    return json({
      quando_utc: agora.toISOString(),
      quando_brasilia: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      origem: {
        rede: "Cloudflare Workers",
        ipv4_de_saida_socket: { antes_dos_testes: ipv4Antes, depois_dos_testes: ipv4Depois },
        ip_de_saida_http: campo("ip"),
        datacenter: campo("colo"),
      },
      caixas: (data ?? []).map((c) => c.email),
      testes,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
