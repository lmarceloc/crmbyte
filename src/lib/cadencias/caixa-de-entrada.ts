// Resposta e bounce das cadências, lidos da caixa de entrada (IMAP) de cada
// caixa de envio. Roda no começo de cada tick do worker, antes dos envios,
// para que um lead que respondeu não receba o próximo e-mail.
//
// Casamento: pelo Message-ID do envio que a mensagem cita (o mesmo gravado em
// `email_enviado`); sem isso, pelo endereço (remetente da resposta ou
// destinatário devolvido) entre os contatos que receberam e-mail DESTA caixa.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { montarConfigImap } from "@/lib/email/caixas";
import { classificarMensagem, type MensagemDaEntrada } from "@/lib/email/entrada";
import { lerCaixaDeEntrada, type EstadoDaEntrada } from "@/lib/email/entrada-imap";
import type { ConfigImap } from "@/lib/email/imap";
import { configuracaoPadrao, type ConfiguracaoDaCadencia } from "./tipos";

/** Cada caixa é lida no máximo a cada N minutos. */
export const INTERVALO_DA_ENTRADA_MIN = 3;
const CAIXAS_POR_TICK = 10;
/** Tempo do tick reservado à leitura (o resto é dos envios; a rota tem 60 s). */
const ORCAMENTO_MS = 25_000;

export interface ResultadoDaEntrada {
  caixasLidas: number;
  respostas: number;
  bounces: number;
  erros: number;
}

interface CaixaComEntrada {
  id: string;
  accountId: string;
  email: string;
  imap: ConfigImap;
  estado: EstadoDaEntrada;
}

interface InscricaoAlvo {
  id: string;
  account_id: string;
  cadence_id: string;
  deal_id: string;
  contact_id: string;
  status: string;
  configuracao: ConfiguracaoDaCadencia;
}

export interface DependenciasDaEntrada {
  lerEntrada?: typeof lerCaixaDeEntrada;
  orcamentoMs?: number;
}

const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const unicos = <T,>(xs: T[]) => [...new Set(xs)];

// ---------- caixas ----------

async function caixasParaLer(admin: SupabaseClient, agora: Date): Promise<CaixaComEntrada[]> {
  const limite = new Date(agora.getTime() - INTERVALO_DA_ENTRADA_MIN * 60_000).toISOString();
  const { data } = await admin
    .from("email_mailboxes")
    .select(
      "id,account_id,email,smtp_username,smtp_password_encrypted,imap_host,imap_port,imap_security,imap_sent_folder,imap_inbox_uid_validity,imap_inbox_last_uid,imap_inbox_checked_at",
    )
    .not("imap_host", "is", null)
    .or(`imap_inbox_checked_at.is.null,imap_inbox_checked_at.lt.${limite}`)
    .order("imap_inbox_checked_at", { ascending: true, nullsFirst: true })
    .limit(CAIXAS_POR_TICK);

  const caixas: CaixaComEntrada[] = [];
  for (const l of data ?? []) {
    let password = "";
    try {
      password = l.smtp_password_encrypted ? decrypt(l.smtp_password_encrypted) : "";
    } catch {
      continue;
    }
    const imap = montarConfigImap({
      imapHost: l.imap_host,
      imapPort: l.imap_port,
      imapSecurity: l.imap_security,
      pastaEnviados: l.imap_sent_folder,
      smtpUsername: l.smtp_username,
      email: l.email,
      password,
    });
    if (!imap) continue;
    caixas.push({
      id: l.id,
      accountId: l.account_id,
      email: l.email,
      imap,
      estado: {
        uidValidity: l.imap_inbox_uid_validity === null ? null : Number(l.imap_inbox_uid_validity),
        ultimoUid: l.imap_inbox_last_uid === null ? null : Number(l.imap_inbox_last_uid),
      },
    });
  }
  return caixas;
}

/** Marca a leitura antes de começar: dois ticks simultâneos não leem a mesma caixa. */
async function reservar(admin: SupabaseClient, c: CaixaComEntrada, agora: Date): Promise<boolean> {
  const limite = new Date(agora.getTime() - INTERVALO_DA_ENTRADA_MIN * 60_000).toISOString();
  const { data } = await admin
    .from("email_mailboxes")
    .update({ imap_inbox_checked_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("account_id", c.accountId)
    .or(`imap_inbox_checked_at.is.null,imap_inbox_checked_at.lt.${limite}`)
    .select("id")
    .maybeSingle();
  return !!data;
}

// ---------- casamento ----------

async function inscricoesPorMessageId(admin: SupabaseClient, accountId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await admin
    .from("email_cadence_events")
    .select("enrollment_id")
    .eq("account_id", accountId)
    .eq("tipo", "email_enviado")
    .in("metadata->>message_id", ids.slice(0, 50));
  return unicos((data ?? []).map((e) => e.enrollment_id as string));
}

/** Inscrições de contatos com esse e-mail que receberam envio desta caixa. */
async function inscricoesPorEndereco(
  admin: SupabaseClient,
  caixa: CaixaComEntrada,
  emails: string[],
): Promise<string[]> {
  const contatos: string[] = [];
  for (const email of emails.slice(0, 10)) {
    const { data } = await admin
      .from("contacts")
      .select("id")
      .eq("account_id", caixa.accountId)
      .ilike("email", escaparLike(email))
      .limit(20);
    contatos.push(...(data ?? []).map((c) => c.id as string));
  }
  if (contatos.length === 0) return [];
  const { data: insc } = await admin
    .from("email_cadence_enrollments")
    .select("id")
    .eq("account_id", caixa.accountId)
    .in("contact_id", unicos(contatos))
    .gt("emails_enviados", 0);
  const ids = (insc ?? []).map((i) => i.id as string);
  if (ids.length === 0) return [];
  const { data: envios } = await admin
    .from("email_cadence_events")
    .select("enrollment_id")
    .eq("account_id", caixa.accountId)
    .eq("tipo", "email_enviado")
    .eq("metadata->>caixa_id", caixa.id)
    .in("enrollment_id", ids);
  return unicos((envios ?? []).map((e) => e.enrollment_id as string));
}

async function carregarInscricoes(admin: SupabaseClient, accountId: string, ids: string[]): Promise<InscricaoAlvo[]> {
  if (ids.length === 0) return [];
  const { data } = await admin
    .from("email_cadence_enrollments")
    .select("id,account_id,cadence_id,deal_id,contact_id,status, email_cadences(configuracao)")
    .eq("account_id", accountId)
    .in("id", ids);
  return (data ?? []).map((l) => {
    const cad = Array.isArray(l.email_cadences) ? l.email_cadences[0] : l.email_cadences;
    return {
      id: l.id,
      account_id: l.account_id,
      cadence_id: l.cadence_id,
      deal_id: l.deal_id,
      contact_id: l.contact_id,
      status: l.status,
      configuracao: { ...configuracaoPadrao(), ...((cad?.configuracao as object) ?? {}) },
    };
  });
}

// ---------- efeitos ----------

async function evento(admin: SupabaseClient, i: InscricaoAlvo, tipo: string, metadata: Record<string, unknown>) {
  await admin.from("email_cadence_events").insert({
    account_id: i.account_id,
    cadence_id: i.cadence_id,
    enrollment_id: i.id,
    deal_id: i.deal_id,
    tipo,
    passo_id: null,
    metadata,
  });
}

async function pararSeAtiva(admin: SupabaseClient, i: InscricaoAlvo, motivo: "respondeu" | "bounce", agora: Date) {
  if (i.status !== "ativa") return;
  const { data } = await admin
    .from("email_cadence_enrollments")
    .update({ status: "parada", motivo_parada: motivo, parada_em: agora.toISOString(), processando_ate: null })
    .eq("id", i.id)
    .eq("account_id", i.account_id)
    .eq("status", "ativa")
    .select("id")
    .maybeSingle();
  if (data) await evento(admin, i, "parada", { motivo });
}

/** Grava a resposta (uma vez por inscrição) e para a cadência se ela estiver configurada para isso. */
async function registrarResposta(
  admin: SupabaseClient,
  caixa: CaixaComEntrada,
  i: InscricaoAlvo,
  m: MensagemDaEntrada,
  agora: Date,
): Promise<boolean> {
  const quando = (m.data && m.data < agora ? m.data : agora).toISOString();
  const { data } = await admin
    .from("email_cadence_enrollments")
    .update({ respondeu_em: quando })
    .eq("id", i.id)
    .eq("account_id", i.account_id)
    .is("respondeu_em", null)
    .select("id")
    .maybeSingle();
  if (!data) return false; // já registrada
  await evento(admin, i, "respondido", { caixa_id: caixa.id, de: m.de, assunto: m.assunto.slice(0, 200) });
  if (i.configuracao.paradas.respondeu) await pararSeAtiva(admin, i, "respondeu", agora);
  return true;
}

async function registrarBounce(
  admin: SupabaseClient,
  caixa: CaixaComEntrada,
  i: InscricaoAlvo,
  info: { destinatarios: string[]; status: string | null },
  agora: Date,
): Promise<boolean> {
  const { data } = await admin
    .from("email_cadence_enrollments")
    .update({ bounce_em: agora.toISOString() })
    .eq("id", i.id)
    .eq("account_id", i.account_id)
    .is("bounce_em", null)
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await evento(admin, i, "bounce", {
    caixa_id: caixa.id,
    destinatario: info.destinatarios[0] ?? null,
    status: info.status,
  });
  // o endereço não existe: marca o contato (o worker não envia mais para ele)
  await admin
    .from("contacts")
    .update({ email_bounced_at: agora.toISOString() })
    .eq("id", i.contact_id)
    .eq("account_id", i.account_id)
    .is("email_bounced_at", null);
  if (i.configuracao.paradas.bounce) await pararSeAtiva(admin, i, "bounce", agora);
  return true;
}

async function aplicar(
  admin: SupabaseClient,
  caixa: CaixaComEntrada,
  m: MensagemDaEntrada,
  agora: Date,
  resultado: ResultadoDaEntrada,
) {
  const c = classificarMensagem(m, caixa.email);
  if (c.tipo === "resposta") {
    let ids = await inscricoesPorMessageId(admin, caixa.accountId, c.referencias);
    if (ids.length === 0 && c.de) ids = await inscricoesPorEndereco(admin, caixa, [c.de]);
    for (const i of await carregarInscricoes(admin, caixa.accountId, ids)) {
      if (await registrarResposta(admin, caixa, i, m, agora)) resultado.respostas++;
    }
  } else if (c.tipo === "bounce" && c.permanente) {
    let ids = await inscricoesPorMessageId(admin, caixa.accountId, c.referencias);
    if (ids.length === 0 && c.destinatarios.length) ids = await inscricoesPorEndereco(admin, caixa, c.destinatarios);
    for (const i of await carregarInscricoes(admin, caixa.accountId, ids)) {
      if (await registrarBounce(admin, caixa, i, c, agora)) resultado.bounces++;
    }
  }
  // automática ("estou de férias"), bounce temporário e mensagens da própria caixa: nada a fazer
}

/** Lê a entrada das caixas com IMAP e aplica respostas e bounces. Nunca lança. */
export async function processarCaixasDeEntrada(
  admin: SupabaseClient,
  agora = new Date(),
  deps: DependenciasDaEntrada = {},
): Promise<ResultadoDaEntrada> {
  const resultado: ResultadoDaEntrada = { caixasLidas: 0, respostas: 0, bounces: 0, erros: 0 };
  const inicio = Date.now();
  const ler = deps.lerEntrada ?? lerCaixaDeEntrada;
  let caixas: CaixaComEntrada[] = [];
  try {
    caixas = await caixasParaLer(admin, agora);
  } catch (e) {
    console.error("[cadencia-entrada] listar caixas", e);
    return resultado;
  }

  for (const caixa of caixas) {
    if (Date.now() - inicio > (deps.orcamentoMs ?? ORCAMENTO_MS)) break;
    try {
      if (!(await reservar(admin, caixa, agora))) continue;
      const r = await ler(caixa.imap, caixa.estado, { agora });
      if (!r.ok) {
        resultado.erros++;
        await admin
          .from("email_mailboxes")
          .update({ imap_inbox_error: r.erro.slice(0, 500) })
          .eq("id", caixa.id)
          .eq("account_id", caixa.accountId);
        continue;
      }
      for (const m of r.mensagens) {
        try {
          await aplicar(admin, caixa, m, agora, resultado);
        } catch (e) {
          console.error("[cadencia-entrada] mensagem", caixa.id, m.uid, e);
        }
      }
      await admin
        .from("email_mailboxes")
        .update({
          imap_inbox_uid_validity: r.estado.uidValidity,
          imap_inbox_last_uid: r.estado.ultimoUid,
          imap_inbox_error: null,
        })
        .eq("id", caixa.id)
        .eq("account_id", caixa.accountId);
      resultado.caixasLidas++;
    } catch (e) {
      resultado.erros++;
      console.error("[cadencia-entrada] caixa", caixa.id, e);
    }
  }
  return resultado;
}
