// Caixa conectada pelo login da Microsoft: OAuth 2.0 (código + PKCE, app multiempresa
// registrado pela Byte) e envio pelo Microsoft Graph. Server-only.
//
// Isolamento entre empresas:
//   * permissões DELEGADAS (Mail.Send/Mail.Read): o token só alcança a caixa de quem fez login;
//   * o `state` vai cifrado (AES-GCM, autenticado) com conta + usuário + nonce + validade, e o
//     nonce também fica num cookie httpOnly com o verificador PKCE: o callback só aceita o login
//     iniciado neste navegador, por este usuário, para esta conta;
//   * tokens cifrados no banco, numa tabela sem acesso pelo navegador.
import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import { enderecosSeguros, montarMensagem, type MensagemDeEmail, type ResultadoDoEnvio } from "./smtp";

const AUTORIDADE = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const ESCOPOS = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.Read",
].join(" ");
export const COOKIE_OAUTH = "ms_oauth";
const VALIDADE_DO_LOGIN_MS = 10 * 60_000;

export class MicrosoftError extends Error {}

export function credenciaisDoApp(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Tem que ser idêntica à cadastrada no app (Entra → Autenticação). */
export function urlDeRetorno(origem: string): string {
  return process.env.MICROSOFT_REDIRECT_URI?.trim() || `${origem.replace(/\/+$/, "")}/api/microsoft/callback`;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export interface EstadoDoLogin {
  accountId: string;
  userId: string;
  /** Vendedor dono da caixa (null = compartilhada). */
  ownerUserId: string | null;
  nonce: string;
  exp: number;
}

/** Monta a URL de login + o que o callback precisa para conferir (state e cookie). */
export function iniciarLogin(
  dados: Omit<EstadoDoLogin, "nonce" | "exp">,
  origem: string,
  agora = Date.now(),
): { url: string; cookie: string } {
  const app = credenciaisDoApp();
  if (!app) throw new MicrosoftError("Login com a Microsoft não configurado (MICROSOFT_CLIENT_ID/SECRET).");
  const nonce = b64url(randomBytes(16));
  const verificador = b64url(randomBytes(32));
  const desafio = b64url(createHash("sha256").update(verificador).digest());
  const estado: EstadoDoLogin = { ...dados, nonce, exp: agora + VALIDADE_DO_LOGIN_MS };
  const params = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: urlDeRetorno(origem),
    response_mode: "query",
    scope: ESCOPOS,
    state: encrypt(JSON.stringify(estado)),
    code_challenge: desafio,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTORIDADE}/authorize?${params}`, cookie: encrypt(JSON.stringify({ nonce, verificador })) };
}

/** Confere state + cookie. Lança MicrosoftError se algo não bate. */
export function conferirRetorno(
  state: string | null,
  cookie: string | undefined,
  sessao: { accountId: string; userId: string },
  agora = Date.now(),
): { estado: EstadoDoLogin; verificador: string } {
  if (!state || !cookie) throw new MicrosoftError("Login expirado. Clique em Conectar com Microsoft de novo.");
  let estado: EstadoDoLogin;
  let guardado: { nonce: string; verificador: string };
  try {
    estado = JSON.parse(decrypt(state));
    guardado = JSON.parse(decrypt(cookie));
  } catch {
    throw new MicrosoftError("Login inválido. Clique em Conectar com Microsoft de novo.");
  }
  if (estado.exp < agora) throw new MicrosoftError("Login expirado. Clique em Conectar com Microsoft de novo.");
  if (estado.nonce !== guardado.nonce) throw new MicrosoftError("Login inválido (navegador diferente). Tente de novo.");
  if (estado.accountId !== sessao.accountId || estado.userId !== sessao.userId)
    throw new MicrosoftError("Este login foi iniciado por outro usuário ou outra conta.");
  return { estado, verificador: guardado.verificador };
}

interface RespostaDoToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function pedirToken(corpo: Record<string, string>): Promise<RespostaDoToken> {
  const app = credenciaisDoApp();
  if (!app) throw new MicrosoftError("Login com a Microsoft não configurado.");
  const res = await fetch(`${AUTORIDADE}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, scope: ESCOPOS, ...corpo }),
  });
  const json = (await res.json().catch(() => ({}))) as RespostaDoToken & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const erro = new MicrosoftError(json.error_description?.split("\r\n")[0] || json.error || `HTTP ${res.status}`);
    (erro as MicrosoftError & { codigo?: string }).codigo = json.error;
    throw erro;
  }
  return json;
}

/** Lê o `tid` do id_token (veio direto do endpoint de token, por TLS: não precisa validar assinatura). */
function tenantDoIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.tid === "string" ? payload.tid : null;
  } catch {
    return null;
  }
}

export interface ContaConectada {
  email: string;
  nome: string;
  upn: string;
  tenantId: string | null;
  refreshToken: string;
  accessToken: string;
  expiraEm: Date;
}

export async function trocarCodigo(code: string, verificador: string, origem: string): Promise<ContaConectada> {
  const t = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: urlDeRetorno(origem),
    code_verifier: verificador,
  });
  if (!t.refresh_token) throw new MicrosoftError("A Microsoft não devolveu acesso contínuo (offline_access).");
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { authorization: `Bearer ${t.access_token}` },
  });
  const me = (await res.json().catch(() => ({}))) as { mail?: string | null; userPrincipalName?: string; displayName?: string };
  if (!res.ok || !me.userPrincipalName) throw new MicrosoftError("Não foi possível ler a conta conectada na Microsoft.");
  const email = (me.mail || me.userPrincipalName).trim().toLowerCase();
  if (!me.mail)
    throw new MicrosoftError(`A conta ${me.userPrincipalName} não tem caixa de e-mail no Microsoft 365 (sem licença do Exchange).`);
  return {
    email,
    nome: me.displayName ?? "",
    upn: me.userPrincipalName,
    tenantId: tenantDoIdToken(t.id_token),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    expiraEm: new Date(Date.now() + (t.expires_in - 120) * 1000),
  };
}

// ---------- envio ----------

/** Access token válido da caixa (renova e grava o refresh token novo, se vier). */
async function tokenDaCaixa(admin: SupabaseClient, accountId: string, caixaId: string): Promise<string> {
  const { data } = await admin
    .from("email_mailboxes")
    .select("oauth_refresh_token_encrypted,oauth_access_token_encrypted,oauth_access_expira_em")
    .eq("id", caixaId)
    .eq("account_id", accountId)
    .eq("provedor", "microsoft")
    .maybeSingle();
  if (!data?.oauth_refresh_token_encrypted) throw new MicrosoftError("Caixa sem conexão com a Microsoft. Reconecte.");
  if (data.oauth_access_token_encrypted && data.oauth_access_expira_em && new Date(data.oauth_access_expira_em) > new Date()) {
    try {
      return decrypt(data.oauth_access_token_encrypted);
    } catch {
      /* renova abaixo */
    }
  }
  let t: RespostaDoToken;
  try {
    t = await pedirToken({ grant_type: "refresh_token", refresh_token: decrypt(data.oauth_refresh_token_encrypted) });
  } catch (e) {
    const codigo = (e as { codigo?: string }).codigo;
    if (codigo === "invalid_grant" || codigo === "interaction_required")
      throw new MicrosoftError(
        "A conexão com a Microsoft expirou ou foi revogada (senha trocada, acesso removido pelo administrador). Reconecte a caixa.",
      );
    throw e;
  }
  await admin
    .from("email_mailboxes")
    .update({
      oauth_access_token_encrypted: encrypt(t.access_token),
      oauth_access_expira_em: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString(),
      ...(t.refresh_token ? { oauth_refresh_token_encrypted: encrypt(t.refresh_token) } : {}),
    })
    .eq("id", caixaId)
    .eq("account_id", accountId);
  return t.access_token;
}

/** Envia o MIME pela caixa (POST /me/sendMail). A Microsoft grava a cópia em "Itens Enviados". */
export async function enviarPeloGraph(
  admin: SupabaseClient,
  accountId: string,
  caixaId: string,
  msg: MensagemDeEmail,
): Promise<ResultadoDoEnvio> {
  if (!enderecosSeguros(msg)) return { ok: false, erro: "sender_rejected", detalhe: "Endereço inválido." };
  try {
    const token = await tokenDaCaixa(admin, accountId, caixaId);
    const { raw, messageId } = await montarMensagem(msg);
    const res = await fetch(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: raw.toString("base64"),
    });
    if (res.status === 202) return { ok: true, raw, messageId };
    const corpo = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const detalhe = `Microsoft Graph ${res.status}: ${corpo.error?.message ?? corpo.error?.code ?? "falha no envio"}`;
    if (res.status === 429 || res.status === 503) return { ok: false, erro: "rate_limited", detalhe };
    if (res.status === 400 || res.status === 403) return { ok: false, erro: "sender_rejected", detalhe };
    return { ok: false, erro: "send_failed", detalhe };
  } catch (e) {
    return { ok: false, erro: "send_failed", detalhe: e instanceof Error ? e.message : String(e) };
  }
}
