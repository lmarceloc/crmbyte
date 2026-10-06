// Worker da cadência: roda a cada minuto (cron → /api/cadencias/worker).
// Um passo por inscrição por tick; claim otimista; envio em dobro é pior que
// não-envio (falha repetida PARA a inscrição em vez de reenviar cego).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarCaixaDeEnvio,
  registrarResultadoDaCaixa,
  registrarResultadoDoImapDaCaixa,
  type CaixaDeEnvio,
} from "@/lib/email/caixas";
import { assinaturaEmTexto } from "@/lib/email/assinatura";
import { copiarParaEnviados } from "@/lib/email/imap";
import { enviarPorSmtp, smtpDaInstalacao, type ConfigSmtp } from "@/lib/email/smtp";
import { processarCaixasDeEntrada } from "./caixa-de-entrada";
import { avancarDiasUteis } from "./dias-uteis";
import { corpoEmHtml, corpoEmTexto, escaparMarkdown } from "./corpo-rico";
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
  /** Lidos da caixa de entrada neste tick. */
  respostas: number;
  bounces: number;
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
  cliques: number;
  respondeu_em: string | null;
  emails_enviados: number;
  tentativas: number;
  inscrito_por: string | null;
}

interface Ctx {
  admin: SupabaseClient;
  agora: Date;
  resultado: ResultadoDoTick;
  /** Caixas cujo IMAP falhou neste tick: as próximas cópias delas são puladas até o próximo minuto. */
  imapComFalha: Set<string>;
}

const nomeDaEmpresa = (e: unknown): string | null => {
  const o = Array.isArray(e) ? e[0] : e;
  const n = (o as { name?: string } | null | undefined)?.name;
  return n?.trim() ? n : null;
};

const mais = (d: Date, min: number) => new Date(d.getTime() + min * 60_000).toISOString();

// ---------- funções puras (testáveis) ----------

/**
 * true = sim · false = não · null = ainda não dá para decidir.
 * "Abriu" conta só as aberturas do ÚLTIMO e-mail enviado antes do ramo
 * (`aberturasDoUltimoEmail`); cliques são os da inscrição; a resposta vem da
 * leitura da caixa de entrada (IMAP) — sem IMAP na caixa, "respondeu" só dá "não".
 */
export function avaliarRamo(
  ramo: PassoRamo,
  insc: {
    ultimo_email_em: string | null;
    aberturasDoUltimoEmail?: number;
    cliques?: number;
    respondeu_em?: string | null;
  },
  agora: Date,
): boolean | null {
  const { condicao } = ramo;
  const desde = insc.ultimo_email_em ? new Date(insc.ultimo_email_em) : null;
  const prazoVenceu = desde ? agora.getTime() - desde.getTime() >= condicao.dentroDeDias * DIA_MS : true;
  const atendeu =
    condicao.tipo === "abriu"
      ? (insc.aberturasDoUltimoEmail ?? 0) >= condicao.vezes
      : condicao.tipo === "clicou"
        ? (insc.cliques ?? 0) > 0
        : !!insc.respondeu_em;
  if (atendeu) return true;
  return prazoVenceu ? false : null;
}

export function acharPassoPorId(passos: Passo[], id: string | null): Passo | null {
  return id === null ? null : passoParaExecutar(passos, id);
}

export function assuntoDaResposta(passos: Passo[], ultimoPassoId: string | null, dados: DadosDoLead): string {
  const p = acharPassoPorId(passos, ultimoPassoId);
  if (!p || p.tipo !== "email" || !p.assunto.trim()) return "Re:";
  return `Re: ${renderizar(p.assunto, dados)}`;
}

// Corpo em Markdown simples (negrito, link, lista): ver corpo-rico.ts.
export { corpoEmHtml };

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

async function concluir(ctx: Ctx, i: Inscricao, extra: Record<string, unknown> = {}) {
  await atualizar(ctx, i, { ...extra, status: "concluida", concluida_em: ctx.agora.toISOString() });
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

/**
 * Guarda a cópia do e-mail na pasta "Enviados" da caixa (IMAP). Roda DEPOIS de o
 * estado da inscrição estar salvo: se isto travar ou o processo cair, o e-mail não
 * é reenviado. Nunca lança. Servidor IMAP fora do ar não pode atrasar o lote: após
 * uma falha, as demais cópias dessa caixa neste tick são puladas.
 */
async function guardarCopiaEmEnviados(ctx: Ctx, i: Inscricao, caixa: CaixaDeEnvio, mensagem: Buffer) {
  if (!caixa.imap || !caixa.copiarEnviados || ctx.imapComFalha.has(caixa.id)) return;
  try {
    const r = await copiarParaEnviados(caixa.imap, mensagem);
    if (!r.ok) ctx.imapComFalha.add(caixa.id);
    await registrarResultadoDoImapDaCaixa(ctx.admin, i.account_id, caixa.id, r.ok ? null : r.erro, caixa.imapTinhaErro);
  } catch (e) {
    console.error("[cadencia-worker] cópia em Enviados", e);
  }
}

async function avancarPara(ctx: Ctx, i: Inscricao, proximo: Passo | null, extra: Record<string, unknown> = {}) {
  // fim da lista (cadências antigas) ou caixa Fim: a cadência termina para o lead
  if (!proximo || proximo.tipo === "fim") return concluir(ctx, i, { ...extra, passo_atual_id: proximo?.id ?? null });
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

/** Aberturas do último e-mail enviado nesta inscrição (eventos "aberto" daquele passo). */
async function contarAberturasDoUltimoEmail(ctx: Ctx, i: Inscricao): Promise<number> {
  if (!i.ultimo_email_passo_id) return 0;
  const { count } = await ctx.admin
    .from("email_cadence_events")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", i.id)
    .eq("account_id", i.account_id)
    .eq("tipo", "aberto")
    .eq("passo_id", i.ultimo_email_passo_id);
  return count ?? 0;
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
  contato: {
    name: string | null;
    email: string | null;
    company: string | null;
    job_title: string | null;
    unsub: string | null;
    bounce: string | null;
  },
) {
  if (contato.unsub) return parar(ctx, i, "descadastro");
  if (!contato.email?.trim()) return parar(ctx, i, "sem_email");
  const cfg = cadencia.configuracao;
  // o endereço já voltou (bounce) numa cadência: não adianta insistir
  if (contato.bounce && cfg.paradas.bounce) return parar(ctx, i, "bounce");

  if (!dentroDaJanela(ctx.agora, cfg)) return liberarSemAvancar(ctx, i, MIN_FORA_DA_JANELA);

  const dono = await resolverDono(ctx, deal);
  let caixa: CaixaDeEnvio | null = null;
  if (dono.userId) caixa = await carregarCaixaDeEnvio(ctx.admin, i.account_id, { ownerUserId: dono.userId });
  if (!caixa && cfg.caixaPadraoId && /^[0-9a-f-]{36}$/i.test(cfg.caixaPadraoId))
    caixa = await carregarCaixaDeEnvio(ctx.admin, i.account_id, { id: cfg.caixaPadraoId });
  // sem caixa do dono nem padrão: usa a caixa compartilhada da conta, se houver
  if (!caixa) caixa = await carregarCaixaDeEnvio(ctx.admin, i.account_id, { compartilhada: true });

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
  // valores do lead entram "escapados" para um nome com ** ou [x](url) não virar formatação
  const dadosDoCorpo = Object.fromEntries(
    Object.entries(dados).map(([k, v]) => [k, typeof v === "string" ? escaparMarkdown(v) : v]),
  ) as DadosDoLead;
  const corpo = renderizar(passo.corpo, dadosDoCorpo);

  const base = urlBase();
  const tokenBase = { account_id: i.account_id, cadence_id: i.cadence_id, enrollment_id: i.id, passo_id: passo.id };
  const urlPixel = `${base}/api/cadencias/pixel/${assinarToken({ ...tokenBase, fin: "pixel" })}`;
  const urlDescadastro = `${base}/api/cadencias/descadastro/${assinarToken({ ...tokenBase, fin: "descadastro" })}`;
  const assinatura = caixa?.signatureHtml?.trim() ?? "";

  const html =
    corpoEmHtml(corpo, {
      linkar: (url) => `${base}/api/cadencias/click/${assinarToken({ ...tokenBase, fin: "clique", url })}`,
    }) +
    (assinatura ? `<div style="margin-top:16px">${assinatura}</div>` : "") +
    `<p style="margin-top:24px;font-size:11px;color:#888">Não quer mais receber estes e-mails? <a href="${urlDescadastro}">Descadastrar</a></p>` +
    `<img src="${urlPixel}" width="1" height="1" alt="" style="display:none" />`;
  const text =
    corpoEmTexto(corpo) +
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

  await evento(
    ctx,
    i,
    "email_enviado",
    passo.id,
    caixa
      ? { via: "caixa", caixa_id: caixa.id, message_id: resposta.messageId }
      : { via: "instalacao", message_id: resposta.messageId },
  );
  ctx.resultado.emailsEnviados++;
  await avancarPara(ctx, i, proximoIrmao(cadencia.passos, passo.id), {
    ultimo_email_em: ctx.agora.toISOString(),
    ultimo_email_passo_id: passo.id,
    emails_enviados: i.emails_enviados + 1,
    tentativas: 0,
    ultimo_erro: null,
  });
  // por último: o e-mail já saiu e o estado já foi salvo; a cópia é só conforto do vendedor
  if (caixa) await guardarCopiaEmEnviados(ctx, i, caixa, resposta.raw);
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
    .select("status,assigned_to,user_id,companies(name)")
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
        .select("name,email,company,job_title,email_unsubscribed_at,email_bounced_at,companies(name)")
        .eq("id", i.contact_id)
        .eq("account_id", i.account_id)
        .maybeSingle();
      return executarEmail(ctx, i, passo, { passos, configuracao: cfg }, deal, {
        name: c?.name ?? null,
        email: c?.email ?? null,
        // empresa: a do negócio → a do contato → texto legado do contato
        company: nomeDaEmpresa(deal.companies) ?? nomeDaEmpresa(c?.companies) ?? c?.company ?? null,
        job_title: c?.job_title ?? null,
        unsub: c?.email_unsubscribed_at ?? null,
        bounce: c?.email_bounced_at ?? null,
      });
    }
    case "espera":
      return avancarPara(ctx, i, proximoIrmao(passos, passo.id), {
        proximo_em: avancarDiasUteis(ctx.agora, passo.diasUteis).toISOString(),
      });
    case "tarefa": {
      // Cria a tarefa (aparece em /tarefas, no sininho e na linha do tempo do contato/negócio).
      const dono = await resolverDono(ctx, deal);
      const { data: c } = await ctx.admin
        .from("contacts")
        .select("name,company,job_title,companies(name)")
        .eq("id", i.contact_id)
        .maybeSingle();
      const prazo = avancarDiasUteis(ctx.agora, passo.prazoDias);
      const titulo = renderizar(passo.titulo, {
        primeiro_nome: primeiroNome(c?.name),
        nome: c?.name,
        empresa: nomeDaEmpresa(deal.companies) ?? nomeDaEmpresa(c?.companies) ?? c?.company,
        cargo: c?.job_title,
        vendedor: dono.nome,
        segmento: cfg.tagDoSegmento || null,
      });
      const { data: tarefa, error } = await ctx.admin
        .from("tarefas")
        .upsert(
          {
            account_id: i.account_id,
            titulo: titulo.slice(0, 300) || "Tarefa da cadência",
            tipo: passo.tipoDaTarefa ?? "outra",
            contact_id: i.contact_id,
            deal_id: i.deal_id,
            enrollment_id: i.id,
            passo_id: passo.id,
            origem: "cadencia",
            responsavel_id: dono.userId ?? i.inscrito_por ?? deal.user_id,
            criada_por: i.inscrito_por,
            prazo_em: prazo.toISOString(),
          },
          { onConflict: "enrollment_id,passo_id", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Falha ao criar a tarefa: ${error.message}`);
      // sem linha = já criada numa tentativa anterior: não repete o evento
      if (tarefa) await evento(ctx, i, "tarefa_criada", passo.id, { tarefa_id: tarefa.id });
      return avancarPara(ctx, i, proximoIrmao(passos, passo.id));
    }
    case "ramo": {
      const aberturasDoUltimoEmail = passo.condicao.tipo === "abriu" ? await contarAberturasDoUltimoEmail(ctx, i) : 0;
      const r = avaliarRamo(passo, { ...i, aberturasDoUltimoEmail }, ctx.agora);
      if (r === null) return liberarSemAvancar(ctx, i, MIN_RAMO_SEM_DECISAO);
      await evento(ctx, i, r ? "ramo_sim" : "ramo_nao", passo.id);
      return avancarPara(ctx, i, primeiroDoLado(passo, r ? "sim" : "nao"));
    }
    case "whatsapp":
      return parar(ctx, i, "falha", "Passo de WhatsApp ainda não é enviado pelo worker.");
    case "fim":
      return concluir(ctx, i);
  }
}

export async function processarCadencias(admin: SupabaseClient, agora = new Date()): Promise<ResultadoDoTick> {
  const ctx: Ctx = {
    admin,
    agora,
    resultado: { processadas: 0, emailsEnviados: 0, concluidas: 0, paradas: 0, falhas: 0, respostas: 0, bounces: 0 },
    imapComFalha: new Set(),
  };
  // primeiro a caixa de entrada: quem respondeu (ou deu bounce) para ANTES do próximo envio
  const entrada = await processarCaixasDeEntrada(admin, agora);
  ctx.resultado.respostas = entrada.respostas;
  ctx.resultado.bounces = entrada.bounces;

  const { data: candidatas } = await admin
    .from("email_cadence_enrollments")
    .select(
      "id,account_id,cadence_id,deal_id,contact_id,passo_atual_id,ultimo_email_em,ultimo_email_passo_id,aberturas,cliques,respondeu_em,emails_enviados,tentativas,inscrito_por",
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
