import net, { type AddressInfo, type Server as ServidorTcp } from "net";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O SMTP falso roda em 127.0.0.1, que a checagem anti-SSRF recusa de propósito.
vi.mock("./ssrf", async (original) => ({
  ...(await original<typeof import("./ssrf")>()),
  assertDestinoResolvidoSeguro: async () => undefined,
}));

import { lerCaixaDeEntrada } from "./entrada-imap";
import { copiarParaEnviados } from "./imap";
import { criarServidorDoRelay } from "./relay-servidor";
import { enviarPorSmtp, verificarSmtp } from "./smtp";

const SEGREDO = "s".repeat(40);

/** SMTP mínimo (sem TLS nem AUTH) que guarda o DATA recebido. */
function servidorSmtp() {
  const recebidos: string[] = [];
  const server: ServidorTcp = net.createServer((socket) => {
    let buffer = "";
    let emDados = false;
    socket.write("220 teste ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (emDados) {
          const fim = buffer.indexOf("\r\n.\r\n");
          if (fim === -1) return;
          recebidos.push(buffer.slice(0, fim));
          buffer = buffer.slice(fim + 5);
          emDados = false;
          socket.write("250 OK\r\n");
          continue;
        }
        const quebra = buffer.indexOf("\r\n");
        if (quebra === -1) return;
        const cmd = buffer.slice(0, quebra).toUpperCase();
        buffer = buffer.slice(quebra + 2);
        if (cmd.startsWith("EHLO")) socket.write("250-teste\r\n250 8BITMIME\r\n");
        else if (cmd === "DATA") {
          emDados = true;
          socket.write("354 Pode enviar\r\n");
        } else if (cmd === "QUIT") return void socket.end("221 Tchau\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  return { server, recebidos };
}

const MSG = {
  fromEmail: "hello@agenciabyte.com",
  fromName: "Agência Byte",
  to: "marlon@topflex.net",
  subject: "Proposta",
  html: "<p>Oi</p>",
  text: "Oi",
};

const ouvir = (s: ServidorTcp | Server) =>
  new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as AddressInfo).port)));
const fechar = (s: ServidorTcp | Server) => new Promise((ok) => s.close(ok));

describe("relay de e-mail", () => {
  let relay: Server;
  let smtp: ReturnType<typeof servidorSmtp>;

  beforeEach(async () => {
    relay = criarServidorDoRelay(SEGREDO);
    vi.stubEnv("EMAIL_RELAY_URL", `http://127.0.0.1:${await ouvir(relay)}/`);
    vi.stubEnv("EMAIL_RELAY_SECRET", SEGREDO);
    smtp = servidorSmtp();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await fechar(relay);
    if (smtp.server.listening) await fechar(smtp.server);
  });

  it("envia pelo relay e devolve o mesmo MIME que o servidor SMTP recebeu", async () => {
    const porta = await ouvir(smtp.server);
    const espiao = vi.spyOn(globalThis, "fetch");
    const r = await enviarPorSmtp({ host: "127.0.0.1", port: porta, security: "none", username: "", password: "" }, MSG);
    expect(espiao).toHaveBeenCalledWith(expect.stringMatching(/\/smtp\/enviar$/), expect.anything());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Buffer.isBuffer(r.raw)).toBe(true);
    expect(smtp.recebidos).toHaveLength(1);
    expect(`${smtp.recebidos[0]}\r\n`).toBe(r.raw.toString("utf8"));
    expect(r.raw.toString("utf8")).toContain(`Message-ID: ${r.messageId}`);
  });

  it("verifica o SMTP pelo relay", async () => {
    const porta = await ouvir(smtp.server);
    expect(await verificarSmtp({ host: "127.0.0.1", port: porta, security: "none", username: "", password: "" })).toEqual({
      ok: true,
    });
  });

  it("segredo errado: o envio falha sem abrir conexão SMTP", async () => {
    const porta = await ouvir(smtp.server);
    vi.stubEnv("EMAIL_RELAY_SECRET", "errado");
    const r = await enviarPorSmtp({ host: "127.0.0.1", port: porta, security: "none", username: "", password: "" }, MSG);
    expect(r).toMatchObject({ ok: false, erro: "send_failed" });
    if (!r.ok) expect(r.detalhe).toContain("401");
    expect(smtp.recebidos).toHaveLength(0);
  });

  it("relay fora do ar vira send_failed (a cadência tenta de novo)", async () => {
    vi.stubEnv("EMAIL_RELAY_URL", "http://127.0.0.1:1");
    const r = await enviarPorSmtp({ host: "127.0.0.1", port: 25, security: "none", username: "", password: "" }, MSG);
    expect(r).toMatchObject({ ok: false, erro: "send_failed" });
  });

  it("cópia em Enviados pelo relay nunca lança", async () => {
    vi.stubEnv("EMAIL_RELAY_URL", "http://127.0.0.1:1");
    const cfg = { host: "imap.x.com", port: 993, security: "tls" as const, username: "a", password: "b", pastaEnviados: null };
    const r = await copiarParaEnviados(cfg, Buffer.from("x"));
    expect(r.ok).toBe(false);
  });

  it("leitura da entrada pelo relay devolve as datas como Date", async () => {
    const corpo = {
      ok: true,
      estado: { uidValidity: 7, ultimoUid: 12 },
      mensagens: [{ uid: 12, de: "a@b.com", assunto: "Re: Proposta", data: "2026-10-30T12:00:00.000Z", cabecalhos: {} }],
    };
    const falso = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/imap\/ler$/);
      expect(JSON.parse(init.body as string).opcoes.agora).toBe("2026-11-01T00:00:00.000Z");
      return new Response(JSON.stringify(corpo));
    });
    vi.stubGlobal("fetch", falso);
    const cfg = { host: "imap.x.com", port: 993, security: "tls" as const, username: "a", password: "b", pastaEnviados: null };
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: 7, ultimoUid: 11 }, { agora: new Date("2026-11-01T00:00:00Z") });
    expect(falso).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mensagens[0].data).toEqual(new Date("2026-10-30T12:00:00Z"));
  });

  it("recusa segredo curto ao subir o servidor", () => {
    expect(() => criarServidorDoRelay("curto")).toThrow();
  });
});
