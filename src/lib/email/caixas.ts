// Caixas de envio (SMTP por vendedor). Server-only: a senha nunca sai daqui.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import { sanitizarAssinatura } from "./assinatura";
import { verificarSmtp, type ConfigSmtp } from "./smtp";
import { assertDestinoResolvidoSeguro, DestinoInseguroError } from "./ssrf";

export class CaixaError extends Error {
  constructor(message: string, readonly status: number = 422) {
    super(message);
  }
}

export const caixaInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    email: z.string().trim().toLowerCase().email().max(320),
    from_name: z.string().trim().max(120).default(""),
    owner_user_id: z.string().uuid().nullable().default(null),
    smtp_host: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/, "Servidor SMTP inválido."),
    smtp_port: z.number().int().min(1).max(65535).default(587),
    smtp_security: z.enum(["starttls", "tls", "none"]).default("starttls"),
    smtp_username: z.string().trim().max(320).default(""),
    smtp_password: z.string().max(500).optional(),
    daily_limit: z.number().int().min(1).max(2000).default(50),
    signature_html: z.string().max(20_000).default(""),
  })
  .strict();
export type CaixaInput = z.infer<typeof caixaInputSchema>;

export interface CaixaPublica {
  id: string;
  email: string;
  from_name: string;
  owner_user_id: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_security: "starttls" | "tls" | "none";
  smtp_username: string;
  tem_senha: boolean;
  daily_limit: number;
  verified_at: string | null;
  last_error: string | null;
  signature_html: string;
}

const COLUNAS_PUBLICAS =
  "id,email,from_name,owner_user_id,smtp_host,smtp_port,smtp_security,smtp_username,smtp_password_encrypted,daily_limit,verified_at,last_error,signature_html";

type LinhaCaixa = Omit<CaixaPublica, "tem_senha"> & { smtp_password_encrypted: string | null };

function paraPublica(l: LinhaCaixa): CaixaPublica {
  const { smtp_password_encrypted, ...resto } = l;
  return { ...resto, tem_senha: !!smtp_password_encrypted };
}

export async function listarCaixas(admin: SupabaseClient, accountId: string): Promise<CaixaPublica[]> {
  const { data, error } = await admin
    .from("email_mailboxes")
    .select(COLUNAS_PUBLICAS)
    .eq("account_id", accountId)
    .order("email");
  if (error) throw new CaixaError(error.message, 500);
  return (data as LinhaCaixa[]).map(paraPublica);
}

export async function salvarCaixa(
  admin: SupabaseClient,
  accountId: string,
  userId: string,
  input: CaixaInput,
): Promise<{ caixa: CaixaPublica; criada: boolean; senhaTrocada: boolean }> {
  // 1. senha atual (ao editar, senha vazia mantém a gravada)
  let senhaCifradaAtual: string | null = null;
  if (input.id) {
    const { data } = await admin
      .from("email_mailboxes")
      .select("smtp_password_encrypted")
      .eq("id", input.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!data) throw new CaixaError("Caixa não encontrada.", 404);
    senhaCifradaAtual = data.smtp_password_encrypted;
  }
  const senhaNova = input.smtp_password?.length ? input.smtp_password : null;
  let senhaPura = senhaNova;
  if (!senhaPura && senhaCifradaAtual) {
    try {
      senhaPura = decrypt(senhaCifradaAtual);
    } catch {
      throw new CaixaError("Não foi possível abrir a senha gravada. Informe a senha novamente.");
    }
  }
  if (input.smtp_username && !senhaPura) throw new CaixaError("Informe a senha da caixa.");

  // 2. dono precisa ser membro da conta
  if (input.owner_user_id) {
    const { data: membro } = await admin
      .from("profiles")
      .select("user_id")
      .eq("user_id", input.owner_user_id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!membro) throw new CaixaError("O vendedor escolhido não é membro desta conta.");
  }

  // 3-4. anti-SSRF + verify() ANTES de gravar
  const cfg: ConfigSmtp = {
    host: input.smtp_host,
    port: input.smtp_port,
    security: input.smtp_security,
    username: input.smtp_username,
    password: senhaPura ?? "",
  };
  try {
    await assertDestinoResolvidoSeguro(cfg.host);
  } catch (e) {
    if (e instanceof DestinoInseguroError) throw new CaixaError(e.message);
    throw e;
  }
  const teste = await verificarSmtp(cfg);
  if (!teste.ok) {
    throw new CaixaError(
      teste.tipo === "authentication_failed"
        ? "Usuário ou senha recusados pelo servidor. No Gmail/Outlook use uma senha de app."
        : `Não foi possível conectar ao servidor SMTP (587 = STARTTLS, 465 = TLS): ${teste.detalhe}`,
    );
  }

  // 5-6. cifra, sanitiza e grava
  const linha = {
    account_id: accountId,
    email: input.email,
    from_name: input.from_name,
    owner_user_id: input.owner_user_id,
    smtp_host: input.smtp_host,
    smtp_port: input.smtp_port,
    smtp_security: input.smtp_security,
    smtp_username: input.smtp_username,
    smtp_password_encrypted: senhaNova ? encrypt(senhaNova) : senhaCifradaAtual,
    daily_limit: input.daily_limit,
    signature_html: sanitizarAssinatura(input.signature_html),
    verified_at: new Date().toISOString(),
    last_error: null,
  };
  const consulta = input.id
    ? admin.from("email_mailboxes").update(linha).eq("id", input.id).eq("account_id", accountId)
    : admin.from("email_mailboxes").insert({ ...linha, created_by: userId });
  const { data, error } = await consulta.select(COLUNAS_PUBLICAS).single();
  if (error) {
    if (error.code === "23505")
      throw new CaixaError("Já existe caixa com este e-mail, ou este vendedor já tem caixa.", 409);
    throw new CaixaError(error.message, 500);
  }
  return {
    caixa: paraPublica(data as LinhaCaixa),
    criada: !input.id,
    senhaTrocada: !!senhaNova,
  };
}

export async function removerCaixa(admin: SupabaseClient, accountId: string, id: string): Promise<void> {
  const { data, error } = await admin
    .from("email_mailboxes")
    .delete()
    .eq("id", id)
    .eq("account_id", accountId)
    .select("id");
  if (error) throw new CaixaError(error.message, 500);
  if (!data?.length) throw new CaixaError("Caixa não encontrada.", 404);
}

/** Caixa com credenciais — SÓ para o worker. */
export interface CaixaDeEnvio {
  id: string;
  email: string;
  fromName: string;
  dailyLimit: number;
  signatureHtml: string;
  smtp: ConfigSmtp;
}

export async function carregarCaixaDeEnvio(
  admin: SupabaseClient,
  accountId: string,
  filtro: { ownerUserId: string } | { id: string } | { compartilhada: true },
): Promise<CaixaDeEnvio | null> {
  let q = admin.from("email_mailboxes").select("*").eq("account_id", accountId);
  if ("id" in filtro) q = q.eq("id", filtro.id);
  else if ("ownerUserId" in filtro) q = q.eq("owner_user_id", filtro.ownerUserId);
  else q = q.is("owner_user_id", null).order("created_at"); // caixa compartilhada mais antiga
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  let password = "";
  if (data.smtp_password_encrypted) {
    try {
      password = decrypt(data.smtp_password_encrypted);
    } catch {
      return null;
    }
  }
  return {
    id: data.id,
    email: data.email,
    fromName: data.from_name,
    dailyLimit: data.daily_limit,
    signatureHtml: data.signature_html,
    smtp: {
      host: data.smtp_host,
      port: data.smtp_port,
      security: data.smtp_security,
      username: data.smtp_username,
      password,
    },
  };
}

export async function registrarResultadoDaCaixa(
  admin: SupabaseClient,
  accountId: string,
  id: string,
  erro: string | null,
  tinhaErro: boolean,
): Promise<void> {
  if (erro) {
    await admin
      .from("email_mailboxes")
      .update({ last_error: erro.slice(0, 500) })
      .eq("id", id)
      .eq("account_id", accountId);
  } else if (tinhaErro) {
    await admin
      .from("email_mailboxes")
      .update({ last_error: null })
      .eq("id", id)
      .eq("account_id", accountId);
  }
}
