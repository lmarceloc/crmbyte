import net, { type AddressInfo, type Server } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O SMTP falso roda em 127.0.0.1, que a checagem anti-SSRF recusa de propósito.
vi.mock("./ssrf", () => ({ assertDestinoResolvidoSeguro: async () => undefined }));

import { enviarPorSmtp } from "./smtp";

interface Recebido {
  mailFrom: string;
  rcptTo: string[];
  dados: string;
}

/** Servidor SMTP mínimo (sem TLS nem AUTH): guarda o envelope e o DATA de cada mensagem. */
function servidorSmtp(recusarRcpt = false) {
  const recebidos: Recebido[] = [];
  const server: Server = net.createServer((socket) => {
    let atual: Recebido = { mailFrom: "", rcptTo: [], dados: "" };
    let emDados = false;
    let buffer = "";
    socket.write("220 teste ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (emDados) {
          const fim = buffer.indexOf("\r\n.\r\n");
          if (fim === -1) return;
          atual.dados = buffer.slice(0, fim);
          buffer = buffer.slice(fim + 5);
          emDados = false;
          recebidos.push(atual);
          atual = { mailFrom: "", rcptTo: [], dados: "" };
          socket.write("250 OK\r\n");
          continue;
        }
        const quebra = buffer.indexOf("\r\n");
        if (quebra === -1) return;
        const linha = buffer.slice(0, quebra);
        buffer = buffer.slice(quebra + 2);
        const cmd = linha.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) socket.write("250-teste\r\n250 8BITMIME\r\n");
        else if (cmd.startsWith("MAIL FROM")) {
          atual.mailFrom = /<([^>]*)>/.exec(linha)?.[1] ?? "";
          socket.write("250 OK\r\n");
        } else if (cmd.startsWith("RCPT TO")) {
          if (recusarRcpt) socket.write("550 5.1.1 Usuario desconhecido\r\n");
          else {
            atual.rcptTo.push(/<([^>]*)>/.exec(linha)?.[1] ?? "");
            socket.write("250 OK\r\n");
          }
        } else if (cmd === "DATA") {
          emDados = true;
          socket.write("354 Pode enviar\r\n");
        } else if (cmd === "QUIT") {
          socket.end("221 Tchau\r\n");
          return;
        } else socket.write("250 OK\r\n");
      }
    });
  });
  return { server, recebidos };
}

const MSG = {
  fromEmail: "hello@agenciabyte.com",
  fromName: "Agência Byte",
  to: "marlon@topflex.net",
  subject: "Olá, Marlon — proposta",
  html: "<p>Oi <b>Marlon</b></p>",
  text: "Oi Marlon",
  headers: { "List-Unsubscribe": "<https://crm.exemplo.com/descadastro/abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
};

describe("enviarPorSmtp", () => {
  let ativo: ReturnType<typeof servidorSmtp>;
  const cfg = (porta: number) => ({ host: "127.0.0.1", port: porta, security: "none" as const, username: "", password: "" });

  async function subir(recusarRcpt = false) {
    ativo = servidorSmtp(recusarRcpt);
    await new Promise<void>((ok) => ativo.server.listen(0, "127.0.0.1", ok));
    return (ativo.server.address() as AddressInfo).port;
  }

  beforeEach(() => {
    ativo = undefined as never;
  });
  afterEach(async () => {
    if (ativo) await new Promise((ok) => ativo.server.close(ok));
  });

  it("entrega com o envelope certo e devolve o mesmo MIME que foi entregue", async () => {
    const porta = await subir();
    const r = await enviarPorSmtp(cfg(porta), MSG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(ativo.recebidos).toHaveLength(1);
    const entregue = ativo.recebidos[0];
    expect(entregue.mailFrom).toBe("hello@agenciabyte.com");
    expect(entregue.rcptTo).toEqual(["marlon@topflex.net"]);
    // o que o servidor recebeu é exatamente o que será copiado em "Enviados"
    // (o CRLF final da mensagem é o começo do terminador "\r\n.\r\n" do DATA)
    expect(`${entregue.dados}\r\n`).toBe(r.raw.toString("utf8"));
    expect(r.messageId).toMatch(/^<[0-9a-f-]{36}@agenciabyte\.com>$/);
  });

  it("o MIME traz Message-ID, remetente, destinatário e os cabeçalhos de descadastro", async () => {
    const porta = await subir();
    const r = await enviarPorSmtp(cfg(porta), { ...MSG, replyTo: "vendedor@agenciabyte.com" });
    if (!r.ok) throw new Error("envio deveria ter funcionado");
    const mime = r.raw.toString("utf8");
    expect(mime).toContain(`Message-ID: ${r.messageId}`);
    expect(mime).toContain("hello@agenciabyte.com");
    expect(mime).toContain("To: marlon@topflex.net");
    expect(mime).toContain("List-Unsubscribe: <https://crm.exemplo.com/descadastro/abc>");
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(mime).toContain("Reply-To: vendedor@agenciabyte.com");
    expect(mime).toMatch(/Content-Type: multipart\/alternative/);
    expect(mime).toContain("Oi Marlon");
    expect(mime).not.toMatch(/^Bcc:/im);
  });

  it("não envia Bcc nem destinatários extras", async () => {
    const porta = await subir();
    await enviarPorSmtp(cfg(porta), MSG);
    expect(ativo.recebidos[0].rcptTo).toHaveLength(1);
  });

  it("devolve sender_rejected quando o servidor recusa o destinatário (550)", async () => {
    const porta = await subir(true);
    const r = await enviarPorSmtp(cfg(porta), MSG);
    expect(r).toMatchObject({ ok: false, erro: "sender_rejected" });
    expect(ativo.recebidos).toHaveLength(0);
  });

  it("recusa endereço com caractere de cabeçalho antes de abrir conexão", async () => {
    const r = await enviarPorSmtp(cfg(1), { ...MSG, to: "a@b.c\r\nBcc: x@y.z" });
    expect(r).toMatchObject({ ok: false, erro: "sender_rejected" });
  });
});
