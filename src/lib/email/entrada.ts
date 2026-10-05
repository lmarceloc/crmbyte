// Classifica as mensagens da caixa de entrada: resposta do lead, bounce
// (devolução) ou resposta automática ("estou de férias"). Funções puras.
//
// O casamento com a cadência é feito depois, pelo Message-ID do envio que a
// mensagem cita (In-Reply-To / References numa resposta; o cabeçalho da
// mensagem original anexada num bounce).

export interface MensagemDaEntrada {
  uid: number;
  /** Endereço do remetente, minúsculo. */
  de: string | null;
  assunto: string;
  data: Date | null;
  /** Cabeçalhos em minúsculas (já desdobrados). */
  cabecalhos: Record<string, string>;
  /** Início do MIME bruto — só para os possíveis bounces (relatório DSN). */
  corpo?: string;
}

export type Classificacao =
  | { tipo: "resposta"; referencias: string[]; de: string | null }
  | { tipo: "bounce"; referencias: string[]; destinatarios: string[]; permanente: boolean; status: string | null }
  | { tipo: "automatica" }
  | { tipo: "ignorar" };

const MESSAGE_ID = /<[^<>\s]+@[^<>\s]+>/g;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Message-IDs (`<...@...>`) citados num texto, sem repetir. */
export function extrairMessageIds(texto: string | undefined | null): string[] {
  return [...new Set((texto ?? "").match(MESSAGE_ID) ?? [])];
}

/** Desdobra e indexa um bloco de cabeçalhos (`Nome: valor`, continuação com espaço). */
export function lerCabecalhos(bruto: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const desdobrado = bruto.replace(/\r?\n[ \t]+/g, " ");
  for (const linha of desdobrado.split(/\r?\n/)) {
    const i = linha.indexOf(":");
    if (i <= 0) continue;
    const nome = linha.slice(0, i).trim().toLowerCase();
    const valor = linha.slice(i + 1).trim();
    saida[nome] = saida[nome] ? `${saida[nome]} ${valor}` : valor;
  }
  return saida;
}

const REMETENTE_DE_BOUNCE = /^(mailer-daemon|mailerdaemon|mail-daemon|postmaster)$/i;
const ASSUNTO_DE_BOUNCE =
  /(undeliver|undelivered|delivery status notification|delivery (has )?failed|mail delivery (failed|system)|returned mail|failure notice|n[ãa]o (foi poss[ií]vel )?entreg|falha (na|de) entrega|mensagem n[ãa]o entregue|devolvid)/i;
const ASSUNTO_DE_ATRASO = /(delay|delayed|atrasad|still trying|ainda tentando|warning:|aviso:)/i;
const ASSUNTO_AUTOMATICO =
  /^\s*(re:\s*)?(resposta autom[áa]tica|automatic reply|auto(matic)?[- ]?reply|autoreply|out of (the )?office|fora do escrit[óo]rio|ausente|aus[êe]ncia|em f[ée]rias|on vacation|i('| a)m away)/i;

function parteLocal(email: string | null): string {
  return (email ?? "").split("@")[0] ?? "";
}

/** Indício de devolução: remetente do sistema, relatório DSN ou cabeçalho de falha. */
export function pareceBounce(m: Pick<MensagemDaEntrada, "de" | "assunto" | "cabecalhos">): boolean {
  const ct = (m.cabecalhos["content-type"] ?? "").toLowerCase();
  if (ct.includes("multipart/report") && ct.includes("delivery-status")) return true;
  if (m.cabecalhos["x-failed-recipients"]) return true;
  if (REMETENTE_DE_BOUNCE.test(parteLocal(m.de))) return true;
  // alguns servidores mandam a devolução com o próprio endereço como remetente
  return !m.de && ASSUNTO_DE_BOUNCE.test(m.assunto);
}

function pareceAutomatica(m: Pick<MensagemDaEntrada, "assunto" | "cabecalhos">): boolean {
  const h = m.cabecalhos;
  const auto = (h["auto-submitted"] ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-autoresponder"]) return true;
  if (/auto[_-]?reply/i.test(h["precedence"] ?? "")) return true;
  return ASSUNTO_AUTOMATICO.test(m.assunto);
}

/** Lê o relatório de entrega (RFC 3464) — e, sem ele, o que der para tirar do texto. */
export function lerRelatorioDeEntrega(
  corpo: string,
  m: Pick<MensagemDaEntrada, "assunto" | "cabecalhos">,
): { destinatarios: string[]; referencias: string[]; permanente: boolean; status: string | null } {
  const destinatarios = new Set<string>();
  for (const r of corpo.matchAll(/^(?:final|original)-recipient:\s*rfc822;\s*<?([^\s<>;]+)>?/gim)) {
    destinatarios.add(r[1].toLowerCase());
  }
  for (const r of (m.cabecalhos["x-failed-recipients"] ?? "").split(/[,\s]+/)) {
    if (EMAIL.test(r)) destinatarios.add(r.toLowerCase());
  }

  const status = /^status:\s*([245]\.\d{1,3}\.\d{1,3})/im.exec(corpo)?.[1] ?? null;
  const acao = /^action:\s*([a-z]+)/im.exec(corpo)?.[1]?.toLowerCase() ?? null;
  let permanente: boolean;
  if (acao === "delayed" || acao === "delivered" || acao === "relayed" || acao === "expanded") permanente = false;
  else if (acao === "failed") permanente = true;
  else if (status) permanente = status.startsWith("5");
  else permanente = !ASSUNTO_DE_ATRASO.test(m.assunto);

  // Message-IDs só dos cabeçalhos citados (o da mensagem original vem anexado)
  const referencias = new Set<string>(extrairMessageIds(m.cabecalhos["in-reply-to"]));
  for (const id of extrairMessageIds(m.cabecalhos["references"])) referencias.add(id);
  for (const linha of corpo.matchAll(/^(?:message-id|in-reply-to|references):[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/gim)) {
    for (const id of extrairMessageIds(linha[0])) referencias.add(id);
  }
  const proprio = m.cabecalhos["message-id"];
  if (proprio) for (const id of extrairMessageIds(proprio)) referencias.delete(id);

  return { destinatarios: [...destinatarios], referencias: [...referencias], permanente, status };
}

/**
 * Classifica uma mensagem da entrada. `proprioEmail` é o endereço da caixa:
 * mensagem dela mesma (cópia, encaminhamento) nunca conta como resposta do lead.
 */
export function classificarMensagem(m: MensagemDaEntrada, proprioEmail: string): Classificacao {
  if (pareceBounce(m)) {
    return { tipo: "bounce", ...lerRelatorioDeEntrega(m.corpo ?? "", m) };
  }
  if (m.de && m.de === proprioEmail.toLowerCase()) return { tipo: "ignorar" };
  if (pareceAutomatica(m)) return { tipo: "automatica" };
  const referencias = [
    ...new Set([...extrairMessageIds(m.cabecalhos["in-reply-to"]), ...extrairMessageIds(m.cabecalhos["references"])]),
  ];
  return { tipo: "resposta", referencias, de: m.de };
}
