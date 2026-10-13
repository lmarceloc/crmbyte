// Envio do resumo semanal: toda segunda a partir das 8h (Brasília), uma vez por conta,
// para os perfis owner/admin. Chamado a cada tick do worker de cadência.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCaixaDeEnvio } from "@/lib/email/caixas";
import { enviarPorSmtp, smtpDaInstalacao, type ConfigSmtp } from "@/lib/email/smtp";
import { montarResumo } from "./dados";
import { assuntoDoResumo, htmlDoResumo, textoDoResumo } from "./email";
import { horaDeEnviar, semanaAnterior, type Semana } from "./periodo";

/** Contas por tick (cada uma faz ~10 consultas + envios; o tick tem 60 s). */
const CONTAS_POR_TICK = 5;

interface Remetente {
  cfg: ConfigSmtp;
  fromEmail: string;
  fromName: string;
}

async function remetente(admin: SupabaseClient, accountId: string, ownerUserId: string | null): Promise<Remetente | null> {
  const inst = smtpDaInstalacao();
  if (inst) return { cfg: inst.cfg, fromEmail: inst.fromEmail, fromName: inst.fromName || "CRM" };
  const caixa =
    (await carregarCaixaDeEnvio(admin, accountId, { compartilhada: true })) ??
    (ownerUserId ? await carregarCaixaDeEnvio(admin, accountId, { ownerUserId }) : null);
  return caixa ? { cfg: caixa.smtp, fromEmail: caixa.email, fromName: caixa.fromName || "CRM" } : null;
}

export interface ResultadoDoResumo {
  enviados: number;
  falhas: string[];
  /** Chegou a tentar o SMTP (false = faltou remetente/destinatário: não adianta repetir). */
  tentou: boolean;
}

/** Monta e envia o resumo de uma conta. `para` restringe os destinatários (prévia). */
export async function enviarResumoDaConta(
  admin: SupabaseClient,
  accountId: string,
  semana: Semana,
  para?: string[],
): Promise<ResultadoDoResumo> {
  const { data: conta } = await admin
    .from("accounts")
    .select("name,default_currency,owner_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!conta) return { enviados: 0, falhas: ["Conta não encontrada."], tentou: false };

  let destinatarios = para;
  if (!destinatarios) {
    const { data: perfis } = await admin
      .from("profiles")
      .select("email")
      .eq("account_id", accountId)
      .in("account_role", ["owner", "admin"]);
    destinatarios = [...new Set((perfis ?? []).map((p) => (p.email as string | null)?.trim()).filter((e): e is string => !!e))];
  }
  if (destinatarios.length === 0) return { enviados: 0, falhas: ["Nenhum dono/admin com e-mail."], tentou: false };

  const de = await remetente(admin, accountId, conta.owner_user_id as string | null);
  if (!de) return { enviados: 0, falhas: ["Nenhuma caixa de envio ou SMTP da instalação configurado."], tentou: false };

  const resumo = await montarResumo(admin, accountId, semana);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const dados = {
    nomeDaConta: (conta.name as string) || "Sua conta",
    moeda: (conta.default_currency as string) || "BRL",
    semana,
    resumo,
    urlDoPainel: base ? `${base}/dashboard` : "",
  };
  const subject = assuntoDoResumo(dados);
  const html = htmlDoResumo(dados);
  const text = textoDoResumo(dados);

  const resultado: ResultadoDoResumo = { enviados: 0, falhas: [], tentou: true };
  for (const to of destinatarios) {
    const r = await enviarPorSmtp(de.cfg, { fromEmail: de.fromEmail, fromName: de.fromName, to, subject, html, text });
    if (r.ok) resultado.enviados++;
    else resultado.falhas.push(`${to}: ${r.detalhe}`);
  }
  return resultado;
}

/** Tick: envia o resumo da semana anterior às contas que ainda não receberam. */
export async function processarResumosSemanais(admin: SupabaseClient, agora = new Date()): Promise<number> {
  if (!horaDeEnviar(agora)) return 0;
  const semana = semanaAnterior(agora);

  const { data: jaEnviadas } = await admin.from("resumos_semanais").select("account_id").eq("semana_inicio", semana.chave);
  const feitas = new Set((jaEnviadas ?? []).map((r) => r.account_id as string));
  const { data: contas } = await admin.from("accounts").select("id").order("created_at");
  const pendentes = (contas ?? []).map((c) => c.id as string).filter((id) => !feitas.has(id)).slice(0, CONTAS_POR_TICK);

  let enviadas = 0;
  for (const accountId of pendentes) {
    // claim: outro tick simultâneo não envia em dobro
    const { data: claim } = await admin
      .from("resumos_semanais")
      .upsert({ account_id: accountId, semana_inicio: semana.chave }, { onConflict: "account_id,semana_inicio", ignoreDuplicates: true })
      .select("account_id");
    if (!claim?.length) continue;
    try {
      const r = await enviarResumoDaConta(admin, accountId, semana);
      // conta sem remetente/destinatário fica marcada (não adianta tentar a cada minuto);
      // falha de SMTP em todos os destinatários libera para a próxima tentativa
      if (r.tentou && r.enviados === 0) {
        await admin.from("resumos_semanais").delete().eq("account_id", accountId).eq("semana_inicio", semana.chave);
      } else {
        await admin
          .from("resumos_semanais")
          .update({ destinatarios: r.enviados })
          .eq("account_id", accountId)
          .eq("semana_inicio", semana.chave);
        if (r.enviados) enviadas++;
      }
      if (r.falhas.length) console.warn("[resumo-semanal]", accountId, r.falhas);
    } catch (e) {
      await admin.from("resumos_semanais").delete().eq("account_id", accountId).eq("semana_inicio", semana.chave);
      console.error("[resumo-semanal]", accountId, e);
    }
  }
  return enviadas;
}
