// Worker da cadência: roda a cada minuto (cron → /api/cadencias/worker).
// Um passo por inscrição por tick; claim otimista; envio em dobro é pior que
// não-envio (falha repetida PARA a inscrição em vez de reenviar cego).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarCaixaDeEnvio,
  registrarResultadoDaCaixa,
  type CaixaDeEnvio,
} from "@/lib/email/caixas";
import { assinaturaEmTexto } from "@/lib/email/assinatura";
import { enviarPorSmtp, smtpDaInstalacao, type ConfigSmtp } from "@/lib/email/smtp";
import { avancarDiasUteis } from "./dias-uteis";
import { dentroDaJanela } from "./janela";
import { passoParaExecutar, primeiroDoLado, proximoIrmao } from "./proximo-passo";
import { primeiroNome, renderizar, type DadosDoLead } from "./renderizar";
import { assinarToken } from "./token";
import { configuracaoPadrao, type ConfiguracaoDaCadencia, type Passo, type PassoEmail, type PassoRamo } from "./tipos";
import type { MotivoDeParada, TipoDeEventoDaCadencia } from "./vocabulario";

const LOTE = 50;
const TRAVA_MS = 3 * 60_000;
const MIN_ESPERA_POR_TETO = 60;
const MIN_RAMO_SEM_DECISAO = 15;
const MIN_CADENCIA_INATIVA = 60;
const MIN_FORA_DA_JANELA = 30;
const MAX_TENTATIVAS = 3;
const DIA_MS = 24 * 60 * 60_000;

export interface ResultadoDoTick {
  processadas: number;
  emailsEnviados: number;
  concluidas: number;
  paradas: number;
  falhas: number;
}

interface Inscricao {
  id: string;
  account_id: string;
  cadence_id: string;
  deal_id: string;
  contact_id: string;
  passo_atual_id: string | null;
  ultimo_email_em: string | null;
  ultimo_email_passo_id: string | null;
  aberturas: number;
  emails_enviados: number;
  tentativas: number;
  inscrito_por: string | null;
}

interface Ctx {
  admin: SupabaseClient;
  agora: Date;
  resultado: ResultadoDoTick;
}

const mais = (d: Date, min: number) => new Date(d.getTime() + min * 60_000).toISOString();

// ---------- funções puras (testáveis) ----------

/** true = sim · false = não · null = ainda não dá para decidir. */
export function avaliarRamo(
  ramo: PassoRamo,
  insc: { ultimo_email_em: string | null; aberturas: number },
  agora: Date,
): boolean | null {
  const { condicao } = ramo;
  const desde = insc.ultimo_email_em ? new Date(insc.ultimo_email_em) : null;
  const prazoVenceu = desde ? agora.getTime() - desde.getTime() >= condicao.dentroDeDias * DIA_MS : true;
  if (condicao.tipo === "abriu") {
    if (insc.aberturas >= condicao.vezes) return true;
    return prazoVenceu ? false : null;
  }
  return prazoVenceu ? false : null; // clicou/respondeu: sem rastreio ⇒ nunca "sim"
}

export function acharPassoPorId(passos: Passo[], id: string | null): Passo | null {
  return id === null ? null : passoParaExecutar(passos, id);
}

export function assuntoDaResposta(passos: Passo[], ultimoPassoId: string | null, dados: DadosDoLead): string {
  const p = acharPassoPorId(passos, ultimoPassoId);
  if (!p || p.tipo !== "email" || !p.assunto.trim()) return "Re:";
  return `Re: ${renderizar(p.assunto, dados)}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const corpoEmHtml = (corpo: string) => esc(corpo).replace(/\n/g, "<br>\n");

/**
 * Transforma URLs do corpo em links rastreados (redirecionador assinado).
 * Opera sobre o HTML já escapado: `&amp;` volta a `&` no destino e o texto
 * visível continua sendo a URL original.
 */
export function linkificarComRastreio(htmlEscapado: string, tokenDe: (url: string) => string, base: string): string {
  return htmlEscapado.replace(/https?:\/\/[^\s<>"']+/g, (visivel) => {
    const limpo = visivel.replace(/[.,;:!?)]+$/, "")
    const resto = visivel.slice(limpo.length)
    const destino = limpo.replace(/&amp;/g, "&")
    if (destino.length > 1800) return visivel
    return `<a href="${base}/api/cadencias/click/${tokenDe(destino)}">${limpo}</a>${resto}`
  })
}

// ---------- persistência ----------

async function evento(
  ctx: Ctx,
  i: Inscricao,
  tipo: TipoDeEventoDaCadencia,
  passoId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await ctx.admin.from("email_cadence_events").insert({
    account_id: i.account_id,
    cadence_id: i.cadence_id,
    enrollment_id: i.id,
    deal_id: i.deal_id,
    tipo,
    passo_id: passoId,
    metadata,
  });
}

async function atualizar(ctx: Ctx, i: Inscricao, campos: Record<string, unknown>) {
  await ctx.admin
    .from("email_cadence_enrollments")
    .update({ processando_ate: null, ...campos })
    .eq("id", i.id)
    .eq("account_id", i.account_id);
}

async function liberarSemAvancar(ctx: Ctx, i: Inscricao, minutos: number) {
  await atualizar(ctx, i, { proximo_em: mais(ctx.agora, minutos) });
}

async function concluir(ctx: Ctx, i: Inscricao) {
  await atualizar(ctx, i, { status: "concluida", concluida_em: ctx.agora.toISOString() });
  await evento(ctx, i, "concluida", null);
  ctx.resultado.concluidas++;
}

async function parar(ctx: Ctx, i: Inscricao, motivo: MotivoDeParada, erro?: string) {
  await atualizar(ctx, i, {
    status: "parada",
    motivo_parada: motivo,
    parada_em: ctx.agora.toISOString(),
    ...(erro ? { ultimo_erro: erro.slice(0, 500) } : {}),
  });
  await evento(ctx, i, "parada", null, { motivo, ...(erro ? { erro } : {}) });
  ctx.resultado.paradas++;
}

async function avancarPara(ctx: Ctx, i: Inscricao, proximo: Passo | null, extra: Record<string, unknown> = {}) {
  if (!proximo) return concluir(ctx, i);
  await atualizar(ctx, i, { passo_atual_id: proximo.id, proximo_em: ctx.agora.toISOString(), ...extra });
}

async function registrarTentativaFalha(ctx: Ctx, i: Inscricao, erro: string) {
  const tentativas = i.tentativas + 1;
  if (tentativas >= MAX_TENTATIVAS) {
    await atualizar(ctx, i, { tentativas });
    return parar(ctx, i, "falha", erro);
  }
  await atualizar(ctx, i, {
    tentativas,
    ultimo_erro: erro.slice(0, 500),
    proximo_em: mais(ctx.agora, tentativas * 5), // backoff 5, 10 min
  });
  await evento(ctx, i, "email_falhou", i.passo_atual_id, { erro, tentativa: tentativas });
  ctx.resultado.falhas++;
}

// ---------- contexto do lead ----------

interface Dono {
  userId: string | null;
  nome: string | null;
  email: string | null;
}

async function resolverDono(ctx: Ctx, deal: { assigned_to: string | null; user_id: string }): Promise<Dono> {
  const q = ctx.admin.from("profiles").select("user_id, full_name, email");
  const { data } = deal.assigned_to
    ? await q.eq("id", deal.assigned_to).maybeSingle()
    : await q.eq("user_id", deal.user_id).maybeSingle();
  return {
    userId: data?.user_id ?? deal.user_id,
    nome: data?.full_name ?? null,
    email: data?.email ?? null,
  };
}

async function contarEnvios(
  ctx: Ctx,
  i: Inscricao,
  filtro: { caixaId: string } | { instalacao: true },
  cadenceId?: string,
): Promise<number> {
  let q = ctx.admin
    .from("email_cadence_events")
    .select("id", { count: "exact", head: true })
    .eq("account_id", i.account_id)
    .eq("tipo", "email_enviado")
    .gte("created_at", new Date(ctx.agora.getTime() - DIA_MS).toISOString());
  q = "caixaId" in filtro ? q.eq("metadata->>caixa_id", filtro.caixaId) : q.eq("metadata->>via", "instalacao");
  if (cadenceId) q = q.eq("cadence_id", cadenceId);
  const { count } = await q;
  return count ?? 0;
}

function limiteDaInstalacao(): number {
  const n = Number(process.env.CADENCIA_LIMITE_EMAILS_POR_DIA);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function urlBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

// ---------- passos ----------

async function executarEmail(
  ctx: Ctx,
  i: Inscricao,
  passo: PassoEmail,
  cadencia: { passos: Passo[]; configuracao: ConfiguracaoDaCadencia },
  deal: { assigned_to: string | null; user_id: string },
  contato: { name: string | null; email: string | null; company: string | null; job_title: string | null; unsub: string | null },
) {
  if (contato.unsub) return parar(ctx, i, "descadastro");
  if (!contato.email?.trim()) return parar(ctx, i, "sem_email");
  const cfg = cadencia.configuracao;

  if (!dentroDaJanela(ctx.agora, cfg)) return liberarSemAvancar(ctx, i, MIN_FORA_DA_JANELA);

  const dono = await resolverDono(ctx, deal);
  let caixa: CaixaDeEnvio | null = null;
  if (dono.userId) caixa = await carregarCaixaDeEnvio(ctx.admin, i.account_id, { ownerUserId: dono.userId });
  if (!caixa && cfg.caixaPadraoId && /^[0-9a-f-]{36}$/i.test(cfg.caixaPadraoId))
    caixa = await carregarCaixaDeEnvio(ctx.admin, i.account_id, { id: cfg.caixaPadraoId });

  const instalacao = caixa ? null : smtpDaInstalacao();
  if (!caixa && !instalacao) {
    return registrarTentativaFalha(ctx, i, "Nenhuma caixa de envio ou SMTP da instalação configurado.");
  }

  // tetos diários (checados ANTES do envio; rolling 24h)
  const bateu = async (limite: number, usado: number, extra: Record<string, unknown>) => {
    if (usado < limite) return false;
    await evento(ctx, i, "limite_diario_atingido", passo.id, { limite, contagem: usado, ...extra });
    await liberarSemAvancar(ctx, i, MIN_ESPERA_POR_TETO);
    return true;
  };
  if (caixa) {
    if (await bateu(caixa.dailyLimit, await contarEnvios(ctx, i, { caixaId: caixa.id }), { caixa_id: caixa.id })) return;
    const fatia = cfg.limiteDiarioPorCaixa;
    if (await bateu(fatia, await contarEnvios(ctx, i, { caixaId: caixa.id }, i.cadence_id), { caixa_id: caixa.id })) return;
  } else if (await bateu(limiteDaInstalacao(), await contarEnvios(ctx, i, { instalacao: true }), {})) return;

  // montagem
  const dados: DadosDoLead = {
    primeiro_nome: primeiroNome(contato.name),
    nome: contato.name,
    empresa: contato.company,
    cargo: contato.job_title,
    vendedor: dono.nome,
    segmento: cfg.tagDoSegmento || null,
  };
  const assunto = passo.mesmaConversa
    ? assuntoDaResposta(cadencia.passos, i.ultimo_email_passo_id, dados)
    : renderizar(passo.assunto, dados);
  const corpo = renderizar(passo.corpo, dados);

  const base = urlBase();
  const tokenBase = { account_id: i.account_id, cadence_id: i.cadence_id, enrollment_id: i.id, passo_id: passo.id };
  const urlPixel = `${base}/api/cadencias/pixel/${assinarToken({ ...tokenBase, fin: "pixel" })}`;
  const urlDescadastro = `${base}/api/cadencias/descadastro/${assinarToken({ ...tokenBase, fin: "descadastro" })}`;
  const assinatura = caixa?.signatureHtml?.trim() ?? "";

  const html =
    linkificarComRastreio(
      corpoEmHtml(corpo),
      (url) => assinarToken({ ...tokenBase, fin: "clique", url }),
      base,
    ) +
    (assinatura ? `<div style="margin-top:16px">${assinatura}</div>` : "") +
    `<p style="margin-top:24px;font-size:11px;color:#888">Não quer mais receber estes e-mails? <a href="${urlDescadastro}">Descadastrar</a></p>` +
    `<img src="${urlPixel}" width="1" height="1" alt="" style="display:none" />`;
  const text =
    corpo +
    (assinatura ? `\n\n${assinaturaEmTexto(assinatura)}` : "") +
    `\n\n---\nNão quer mais receber estes e-mails? ${urlDescadastro}`;

  const smtp: ConfigSmtp = caixa ? caixa.smtp : instalacao!.cfg;
  const fromEmail = caixa ? caixa.email : instalacao!.fromEmail;
  const resposta = await enviarPorSmtp(smtp, {
    fromEmail,
    fromName: caixa ? caixa.fromName || dono.nome || "" : dono.nome || instalacao!.fromName,
    to: contato.email.trim(),
    subject: assunto || "(sem assunto)",
    html,
    text,
    replyTo: caixa ? undefined : dono.email ?? undefined,
    headers: {
      "List-Unsubscribe": `<${urlDescadastro}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (caixa) {
    await registrarResultadoDaCaixa(ctx.admin, i.account_id, caixa.id, resposta.ok ? null : resposta.detalhe, false);
  }
  if (!resposta.ok) return registrarTentativaFalha(ctx, i, `${resposta.erro}: ${resposta.detalhe}`);

  await evento(ctx, i, "email_enviado", passo.id, caixa ? { via: "caixa", caixa_id: caixa.id } : { via: "instalacao" });
  ctx.resultado.emailsEnviados++;
  await avancarPara(ctx, i, proximoIrmao(cadencia.passos, passo.id), {
    ultimo_email_em: ctx.agora.toISOString(),
    ultimo_email_passo_id: passo.id,
    emails_enviados: i.emails_enviados + 1,
    tentativas: 0,
    ultimo_erro: null,
  });
}

async function processarInscricao(ctx: Ctx, i: Inscricao) {
  const { data: cadencia } = await ctx.admin
    .from("email_cadences")
    .select("id,status,passos,configuracao")
    .eq("id", i.cadence_id)
    .eq("account_id", i.account_id)
    .maybeSingle();
  if (!cadencia || cadencia.status !== "ativa") return liberarSemAvancar(ctx, i, MIN_CADENCIA_INATIVA);

  const passos = cadencia.passos as Passo[];
  const cfg: ConfiguracaoDaCadencia = { ...configuracaoPadrao(), ...(cadencia.configuracao as object) };

  const { data: deal } = await ctx.admin
    .from("deals")
    .select("status,assigned_to,user_id")
    .eq("id", i.deal_id)
    .eq("account_id", i.account_id)
    .maybeSingle();
  if (!deal) return parar(ctx, i, "ganho_ou_perdido");
  if (cfg.paradas.ganhoOuPerdido && deal.status !== "open") return parar(ctx, i, "ganho_ou_perdido");

  const passo = passoParaExecutar(passos, i.passo_atual_id);
  if (!passo) return concluir(ctx, i);

  switch (passo.tipo) {
    case "email": {
      const { data: c } = await ctx.admin
        .from("contacts")
        .select("name,email,company,job_title,email_unsubscribed_at")
        .eq("id", i.contact_id)
        .eq("account_id", i.account_id)
        .maybeSingle();
      return executarEmail(ctx, i, passo, { passos, configuracao: cfg }, deal, {
        name: c?.name ?? null,
        email: c?.email ?? null,
        company: c?.company ?? null,
        job_title: c?.job_title ?? null,
        unsub: c?.email_unsubscribed_at ?? null,
      });
    }
    case "espera":
      return avancarPara(ctx, i, proximoIrmao(passos, passo.id), {
        proximo_em: avancarDiasUteis(ctx.agora, passo.diasUteis).toISOString(),
      });
    case "tarefa": {
      // O wacrm não tem tabela de tarefas: a tarefa vira nota no contato.
      const dono = await resolverDono(ctx, deal);
      const { data: c } = await ctx.admin
        .from("contacts")
        .select("name,company,job_title")
        .eq("id", i.contact_id)
        .maybeSingle();
      const prazo = avancarDiasUteis(ctx.agora, passo.prazoDias);
      const titulo = renderizar(passo.titulo, {
        primeiro_nome: primeiroNome(c?.name),
        nome: c?.name,
        empresa: c?.company,
        cargo: c?.job_title,
        vendedor: dono.nome,
        segmento: cfg.tagDoSegmento || null,
      });
      const { data: nota, error } = await ctx.admin
        .from("contact_notes")
        .insert({
          account_id: i.account_id,
          contact_id: i.contact_id,
          user_id: i.inscrito_por ?? dono.userId ?? deal.user_id,
          note_text: `[Cadência] Tarefa até ${prazo.toISOString().slice(0, 10)}: ${titulo}`,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Falha ao criar a tarefa: ${error.message}`);
      await evento(ctx, i, "tarefa_criada", passo.id, { note_id: nota.id });
      return avancarPara(ctx, i, proximoIrmao(passos, passo.id));
    }
    case "ramo": {
      const r = avaliarRamo(passo, i, ctx.agora);
      if (r === null) return liberarSemAvancar(ctx, i, MIN_RAMO_SEM_DECISAO);
      await evento(ctx, i, r ? "ramo_sim" : "ramo_nao", passo.id);
      return avancarPara(ctx, i, primeiroDoLado(passo, r ? "sim" : "nao"));
    }
    case "whatsapp":
      return parar(ctx, i, "falha", "Passo de WhatsApp ainda não é enviado pelo worker.");
  }
}

export async function processarCadencias(admin: SupabaseClient, agora = new Date()): Promise<ResultadoDoTick> {
  const ctx: Ctx = {
    admin,
    agora,
    resultado: { processadas: 0, emailsEnviados: 0, concluidas: 0, paradas: 0, falhas: 0 },
  };
  const { data: candidatas } = await admin
    .from("email_cadence_enrollments")
    .select(
      "id,account_id,cadence_id,deal_id,contact_id,passo_atual_id,ultimo_email_em,ultimo_email_passo_id,aberturas,emails_enviados,tentativas,inscrito_por",
    )
    .eq("status", "ativa")
    .lte("proximo_em", agora.toISOString())
    .order("proximo_em")
    .limit(LOTE);

  for (const linha of (candidatas ?? []) as Inscricao[]) {
    // claim otimista: só processa se ninguém é dono agora
    const { data: claim } = await admin
      .from("email_cadence_enrollments")
      .update({ processando_ate: new Date(agora.getTime() + TRAVA_MS).toISOString() })
      .eq("id", linha.id)
      .eq("status", "ativa")
      .or(`processando_ate.is.null,processando_ate.lt.${agora.toISOString()}`)
      .select("id")
      .maybeSingle();
    if (!claim) continue;
    ctx.resultado.processadas++;
    try {
      await processarInscricao(ctx, linha);
    } catch (e) {
      await registrarTentativaFalha(ctx, linha, e instanceof Error ? e.message : String(e));
    }
  }
  return ctx.resultado;
}
