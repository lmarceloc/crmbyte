// Cópia da mensagem enviada na pasta "Enviados" da caixa, via IMAP (APPEND).
// Server-only: a senha nunca sai daqui.
//
// O SMTP só entrega; guardar a cópia é trabalho do cliente de e-mail, e muitos
// provedores não fazem isso sozinhos. Falha aqui NUNCA pode derrubar nem repetir
// um envio: `copiarParaEnviados` não lança, devolve o erro para quem chamou.
import { ImapFlow } from "imapflow";
import { assertDestinoResolvidoSeguro, DestinoInseguroError } from "./ssrf";

export type SegurancaImap = "tls" | "starttls";

export interface ConfigImap {
  host: string;
  port: number;
  security: SegurancaImap;
  username: string;
  password: string;
  /** null = detecta a pasta de enviados sozinho. */
  pastaEnviados: string | null;
}

export interface PastaImap {
  path: string;
  flags?: Iterable<string>;
  specialUse?: string;
}

/** O pedaço do ImapFlow que usamos — permite trocar por um falso nos testes. */
export interface ClienteImap {
  on(evento: "error", ouvinte: (e: Error) => void): unknown;
  connect(): Promise<void>;
  list(): Promise<PastaImap[]>;
  append(pasta: string, conteudo: Buffer, flags?: string[], data?: Date): Promise<unknown>;
  logout(): Promise<void>;
  close(): void;
}

export interface DependenciasImap<C extends ClienteImap = ClienteImap> {
  criarCliente?: (cfg: ConfigImap) => C;
  validarDestino?: (host: string) => Promise<void>;
  limiteMs?: number;
}

/** Teto da conversa inteira (conectar + listar + gravar): o worker atende vários e-mails por minuto. */
const LIMITE_MS = 15_000;

/** Nomes comuns da pasta quando o servidor não marca a especial-uso `\Sent` (minúsculos). */
const NOMES_COMUNS = [
  "sent",
  "sent items",
  "sent messages",
  "sent mail",
  "enviados",
  "itens enviados",
  "mensagens enviadas",
  "inbox.sent",
  "inbox.sent items",
  "inbox.enviados",
  "inbox/sent",
  "inbox/enviados",
];

/**
 * Escolhe a pasta de enviados: a informada (se existir), senão a marcada `\Sent`
 * pelo servidor, senão um nome comum. `null` = não achou.
 */
export function escolherPastaEnviados(pastas: PastaImap[], preferida?: string | null): string | null {
  const gravaveis = pastas.filter((p) => !new Set(p.flags ?? []).has("\\Noselect"));
  const alvo = preferida?.trim();
  if (alvo) {
    return (
      gravaveis.find((p) => p.path === alvo)?.path ??
      gravaveis.find((p) => p.path.toLowerCase() === alvo.toLowerCase())?.path ??
      null
    );
  }
  const marcada = gravaveis.find((p) => p.specialUse === "\\Sent" || new Set(p.flags ?? []).has("\\Sent"));
  if (marcada) return marcada.path;
  for (const nome of NOMES_COMUNS) {
    const achada = gravaveis.find((p) => p.path.toLowerCase() === nome);
    if (achada) return achada.path;
  }
  return null;
}

class PastaNaoEncontradaError extends Error {}

export function criarClienteImapFlow(cfg: ConfigImap): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "tls",
    doSTARTTLS: cfg.security === "starttls" ? true : undefined,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
}

export function descreverErroImap(e: unknown): string {
  const err = e as { responseText?: string; message?: string };
  return (err.responseText || err.message || "Falha desconhecida.").slice(0, 300);
}

/** Conecta (com anti-SSRF), roda `trabalho` e desconecta, tudo dentro de um teto de tempo. */
export async function comConexao<T, C extends ClienteImap = ClienteImap>(
  cfg: ConfigImap,
  deps: DependenciasImap<C>,
  trabalho: (cliente: C) => Promise<T>,
): Promise<T> {
  await (deps.validarDestino ?? ((host: string) => assertDestinoResolvidoSeguro(host, "IMAP")))(cfg.host);
  const cliente = deps.criarCliente ? deps.criarCliente(cfg) : (criarClienteImapFlow(cfg) as unknown as C);
  // O erro de rede chega pelo reject da chamada em andamento; sem ouvinte o Node derruba o processo.
  cliente.on("error", () => undefined);
  const trabalhando = (async () => {
    await cliente.connect();
    const resultado = await trabalho(cliente);
    await cliente.logout().catch(() => undefined);
    return resultado;
  })();
  trabalhando.catch(() => undefined); // se o tempo esgotar primeiro, o erro tardio não fica sem tratar
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(
      () => rejeitar(new Error("Tempo esgotado ao falar com o servidor IMAP.")),
      deps.limiteMs ?? LIMITE_MS,
    );
  });
  try {
    return await Promise.race([trabalhando, limite]);
  } finally {
    clearTimeout(timer);
    cliente.close();
  }
}

async function acharPasta(cliente: ClienteImap, cfg: ConfigImap): Promise<string> {
  const pasta = escolherPastaEnviados(await cliente.list(), cfg.pastaEnviados);
  if (pasta) return pasta;
  throw new PastaNaoEncontradaError(
    cfg.pastaEnviados?.trim()
      ? `A pasta "${cfg.pastaEnviados.trim()}" não existe nesta caixa.`
      : "Não encontrei a pasta Enviados desta caixa. Informe o nome dela.",
  );
}

export type ResultadoDaCopia = { ok: true; pasta: string } | { ok: false; erro: string };

/** Grava `mensagem` (MIME completo) na pasta de enviados, marcada como lida. Nunca lança. */
export async function copiarParaEnviados(
  cfg: ConfigImap,
  mensagem: Buffer,
  deps: DependenciasImap = {},
): Promise<ResultadoDaCopia> {
  try {
    const pasta = await comConexao(cfg, deps, async (cliente) => {
      const destino = await acharPasta(cliente, cfg);
      const gravada = await cliente.append(destino, mensagem, ["\\Seen"], new Date());
      if (gravada === false) throw new Error("O servidor recusou gravar a mensagem.");
      return destino;
    });
    return { ok: true, pasta };
  } catch (e) {
    return { ok: false, erro: descreverErroImap(e) };
  }
}

export type ResultadoDaVerificacaoImap =
  | { ok: true; pasta: string }
  | { ok: false; tipo: "authentication_failed" | "connection_failed" | "folder_not_found"; detalhe: string };

/** Conecta, autentica e confirma que a pasta de enviados existe — sem gravar nada. */
export async function verificarImap(
  cfg: ConfigImap,
  deps: DependenciasImap = {},
): Promise<ResultadoDaVerificacaoImap> {
  try {
    return { ok: true, pasta: await comConexao(cfg, deps, (cliente) => acharPasta(cliente, cfg)) };
  } catch (e) {
    if (e instanceof PastaNaoEncontradaError) return { ok: false, tipo: "folder_not_found", detalhe: e.message };
    if (e instanceof DestinoInseguroError) return { ok: false, tipo: "connection_failed", detalhe: e.message };
    const autenticacao = (e as { authenticationFailed?: boolean }).authenticationFailed === true;
    return { ok: false, tipo: autenticacao ? "authentication_failed" : "connection_failed", detalhe: descreverErroImap(e) };
  }
}
