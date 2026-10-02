import nodemailer, { type Transporter } from "nodemailer";
import { assertDestinoResolvidoSeguro } from "./ssrf";

export type SegurancaSmtp = "starttls" | "tls" | "none";

export interface ConfigSmtp {
  host: string;
  port: number;
  security: SegurancaSmtp;
  username: string;
  password: string;
}

export type ErroDeEntrega =
  | "not_configured"
  | "send_failed"
  | "rate_limited"
  | "sender_rejected";

export interface MensagemDeEmail {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export type ResultadoDoEnvio =
  | { ok: true }
  | { ok: false; erro: ErroDeEntrega; detalhe: string };

/** Nome EHLO = hostname de NEXT_PUBLIC_SITE_URL (o default [127.0.0.1] é filtrado). */
function nomeEhlo(): string | undefined {
  try {
    const h = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname;
    if (!h || !h.includes(".")) return undefined;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return `[${h}]`;
    if (h.includes(":")) return `[IPv6:${h}]`;
    return h;
  } catch {
    return undefined;
  }
}

const CACHE_MAX = 50;
const cache = new Map<string, Transporter>();

function transporte(cfg: ConfigSmtp): Transporter {
  const name = nomeEhlo();
  const chave = [name, cfg.host, cfg.port, cfg.security, cfg.username, cfg.password].join("\0");
  const existente = cache.get(chave);
  if (existente) return existente;
  const t = nodemailer.createTransport({
    name,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "tls",
    requireTLS: cfg.security === "starttls",
    ignoreTLS: cfg.security === "none",
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
  });
  if (cache.size >= CACHE_MAX) {
    const velha = cache.keys().next().value;
    if (velha !== undefined) {
      cache.get(velha)?.close();
      cache.delete(velha);
    }
  }
  cache.set(chave, t);
  return t;
}

const limpaNome = (n: string) => n.replace(/[<>"\r\n]/g, "").trim();
const emailSeguro = (e: string) => !/[<>"\r\n,;\s]/.test(e);

export async function enviarPorSmtp(
  cfg: ConfigSmtp,
  msg: MensagemDeEmail,
): Promise<ResultadoDoEnvio> {
  if (!emailSeguro(msg.fromEmail) || !emailSeguro(msg.to)) {
    return { ok: false, erro: "sender_rejected", detalhe: "Endereço inválido." };
  }
  try {
    await assertDestinoResolvidoSeguro(cfg.host);
    const nome = limpaNome(msg.fromName);
    await transporte(cfg).sendMail({
      from: nome ? `${nome} <${msg.fromEmail}>` : msg.fromEmail,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
      headers: msg.headers,
    });
    return { ok: true };
  } catch (e) {
    const err = e as { responseCode?: number; code?: string; message?: string };
    const detalhe = err.message ?? "Falha no envio.";
    if (err.responseCode === 429 || err.code === "ETIMEDOUT")
      return { ok: false, erro: "rate_limited", detalhe };
    if (err.responseCode === 550 || err.responseCode === 553)
      return { ok: false, erro: "sender_rejected", detalhe };
    return { ok: false, erro: "send_failed", detalhe };
  }
}

export async function verificarSmtp(
  cfg: ConfigSmtp,
): Promise<{ ok: true } | { ok: false; tipo: "authentication_failed" | "connection_failed"; detalhe: string }> {
  try {
    await assertDestinoResolvidoSeguro(cfg.host);
    await transporte(cfg).verify();
    return { ok: true };
  } catch (e) {
    const err = e as { responseCode?: number; code?: string; message?: string };
    return {
      ok: false,
      tipo: err.responseCode === 535 || err.code === "EAUTH" ? "authentication_failed" : "connection_failed",
      detalhe: err.message ?? "Falha na conexão.",
    };
  }
}

/** Transporte da instalação (SMTP_* do .env). null = não configurado. */
export function smtpDaInstalacao(): { cfg: ConfigSmtp; fromEmail: string; fromName: string } | null {
  const host = process.env.SMTP_HOST?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  if (!host || !fromEmail) return null;
  const sec = process.env.SMTP_SECURITY;
  return {
    cfg: {
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      security: sec === "tls" || sec === "none" ? sec : "starttls",
      username: process.env.SMTP_USERNAME ?? "",
      password: process.env.SMTP_PASSWORD ?? "",
    },
    fromEmail,
    fromName: process.env.SMTP_FROM_NAME ?? "",
  };
}
