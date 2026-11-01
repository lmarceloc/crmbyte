// Servidor do relay de e-mail (roda FORA da Cloudflare, ver relay-email/ e
// docs/relay-email.md). Recebe do CRM, por HTTPS e com segredo compartilhado, o
// pedido já montado e abre o socket SMTP/IMAP daqui — de um IP fixo, que o
// provedor de e-mail (Umbler) pode liberar no firewall.
//
// Chama sempre as versões *Direto: mesmo com EMAIL_RELAY_URL no ambiente, o relay
// nunca repassa o pedido para si mesmo.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { lerCaixaDeEntradaDireto, type PedidoDeLeituraNoRelay, type ResultadoDaLeituraNoRelay } from "./entrada-imap";
import { copiarParaEnviadosDireto, verificarImapDireto, type ConfigImap } from "./imap";
import { OPERACOES_DO_RELAY, type OperacaoDoRelay } from "./relay";
import {
  enviarPorSmtpDireto,
  verificarSmtpDireto,
  type ConfigSmtp,
  type MensagemDeEmail,
  type ResultadoDoEnvioNoRelay,
} from "./smtp";
import { ipDeSaidaPorSocket } from "./teste-de-rede";

/** E-mail de cadência é pequeno; o teto só evita abuso. */
const LIMITE_DO_CORPO = 25 * 1024 * 1024;

class PedidoInvalido extends Error {}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function exigir<T>(v: unknown, campo: string): T {
  if (!ehObjeto(v)) throw new PedidoInvalido(`Campo "${campo}" ausente ou inválido.`);
  return v as T;
}

function exigirTexto(v: unknown, campo: string): string {
  if (typeof v !== "string") throw new PedidoInvalido(`Campo "${campo}" ausente ou inválido.`);
  return v;
}

/** Executa uma operação do relay. Exportada para os testes. */
export async function atenderOperacao(op: OperacaoDoRelay, corpo: unknown): Promise<unknown> {
  const c = exigir<Record<string, unknown>>(corpo, "corpo");
  switch (op) {
    case "smtp/enviar": {
      const r = await enviarPorSmtpDireto(exigir<ConfigSmtp>(c.cfg, "cfg"), exigir<MensagemDeEmail>(c.msg, "msg"));
      const resposta: ResultadoDoEnvioNoRelay = r.ok
        ? { ok: true, raw: r.raw.toString("base64"), messageId: r.messageId }
        : r;
      return resposta;
    }
    case "smtp/verificar":
      return verificarSmtpDireto(exigir<ConfigSmtp>(c.cfg, "cfg"));
    case "imap/copiar":
      return copiarParaEnviadosDireto(exigir<ConfigImap>(c.cfg, "cfg"), Buffer.from(exigirTexto(c.raw, "raw"), "base64"));
    case "imap/verificar":
      return verificarImapDireto(exigir<ConfigImap>(c.cfg, "cfg"));
    case "imap/ler": {
      const p = c as unknown as PedidoDeLeituraNoRelay;
      const opcoes = ehObjeto(p.opcoes) ? p.opcoes : {};
      const r = await lerCaixaDeEntradaDireto(exigir<ConfigImap>(p.cfg, "cfg"), exigir(p.estado, "estado"), {
        ...opcoes,
        agora: opcoes.agora ? new Date(opcoes.agora) : undefined,
      });
      const resposta: ResultadoDaLeituraNoRelay = r.ok
        ? { ...r, mensagens: r.mensagens.map((m) => ({ ...m, data: m.data ? m.data.toISOString() : null })) }
        : r;
      return resposta;
    }
  }
}

function segredoConfere(cabecalho: string | undefined, segredo: string): boolean {
  const recebido = Buffer.from((cabecalho ?? "").replace(/^Bearer\s+/i, ""));
  const esperado = Buffer.from(segredo);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, rejeitar) => {
    const partes: Buffer[] = [];
    let tamanho = 0;
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_DO_CORPO) {
        rejeitar(new PedidoInvalido("Corpo grande demais."));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", rejeitar);
  });
}

function responder(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

/**
 * Servidor HTTP do relay. Rotas:
 * - GET  /saude         → { ok, ipv4 } (IPv4 de saída: é ele que se libera no provedor)
 * - POST /smtp/enviar, /smtp/verificar, /imap/copiar, /imap/verificar, /imap/ler
 *   (Authorization: Bearer <segredo>)
 */
export function criarServidorDoRelay(segredo: string): Server {
  if (segredo.length < 32) throw new Error("EMAIL_RELAY_SECRET precisa ter pelo menos 32 caracteres.");
  return createServer(async (req, res) => {
    const caminho = new URL(req.url ?? "/", "http://relay").pathname.replace(/^\/+|\/+$/g, "");
    try {
      if (req.method === "GET" && caminho === "saude") {
        const ip = await ipDeSaidaPorSocket();
        return responder(res, 200, { ok: true, ipv4: ip.ip, erro: ip.erro });
      }
      const op = OPERACOES_DO_RELAY.find((o) => o === caminho);
      if (!op) return responder(res, 404, { erro: "Rota inexistente." });
      if (req.method !== "POST") return responder(res, 405, { erro: "Use POST." });
      if (!segredoConfere(req.headers.authorization, segredo)) return responder(res, 401, { erro: "Segredo inválido." });

      let corpo: unknown;
      try {
        corpo = JSON.parse(await lerCorpo(req));
      } catch (e) {
        throw e instanceof PedidoInvalido ? e : new PedidoInvalido("JSON inválido.");
      }
      return responder(res, 200, await atenderOperacao(op, corpo));
    } catch (e) {
      if (e instanceof PedidoInvalido) return responder(res, 400, { erro: e.message });
      console.error(`[relay-email] ${caminho}`, e);
      return responder(res, 500, { erro: "Falha interna do relay." });
    }
  });
}
