import { describe, expect, it } from "vitest";
import {
  classificarMensagem,
  extrairMessageIds,
  lerCabecalhos,
  lerRelatorioDeEntrega,
  pareceBounce,
  type MensagemDaEntrada,
} from "./entrada";

const CAIXA = "hello@agenciabyte.com";
const ENVIO = "<2f1c7e4a-1111-4222-8333-944445555666@agenciabyte.com>";

const msg = (p: Partial<MensagemDaEntrada>): MensagemDaEntrada => ({
  uid: 1,
  de: "marlon@topflex.net",
  assunto: "Re: Ideia para a Topflex",
  data: new Date("2026-10-05T12:00:00Z"),
  cabecalhos: {},
  ...p,
});

// Devolução típica de Postfix (formato RFC 3464), como a da Umbler.
const DSN_POSTFIX = [
  "This is a MIME-encapsulated message.",
  "",
  "--BOUNDARY",
  "Content-Type: text/plain; charset=us-ascii",
  "",
  "I'm sorry to have to inform you that your message could not",
  "be delivered to one or more recipients.",
  "",
  "<naoexiste@topflex.net>: host mx.topflex.net said: 550 5.1.1 User unknown",
  "",
  "--BOUNDARY",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; smtp.umbler.com",
  "",
  "Final-Recipient: rfc822; naoexiste@topflex.net",
  "Original-Recipient: rfc822;naoexiste@topflex.net",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 User unknown",
  "",
  "--BOUNDARY",
  "Content-Type: text/rfc822-headers",
  "",
  "From: Agência Byte <hello@agenciabyte.com>",
  "To: naoexiste@topflex.net",
  "Subject: Ideia para a Topflex",
  `Message-ID: ${ENVIO}`,
  "",
  "--BOUNDARY--",
].join("\r\n");

describe("lerCabecalhos / extrairMessageIds", () => {
  it("desdobra linhas de continuação e indexa em minúsculas", () => {
    const h = lerCabecalhos(`In-Reply-To: ${ENVIO}\r\nReferences: <a@x.com>\r\n ${ENVIO}\r\nContent-Type: text/plain`);
    expect(h["in-reply-to"]).toBe(ENVIO);
    expect(extrairMessageIds(h["references"])).toEqual(["<a@x.com>", ENVIO]);
    expect(h["content-type"]).toBe("text/plain");
  });
});

describe("classificarMensagem — resposta", () => {
  it("resposta do lead traz os Message-IDs citados", () => {
    const c = classificarMensagem(
      msg({ cabecalhos: { "in-reply-to": ENVIO, references: `<outro@x.com> ${ENVIO}` } }),
      CAIXA,
    );
    expect(c).toEqual({ tipo: "resposta", referencias: [ENVIO, "<outro@x.com>"], de: "marlon@topflex.net" });
  });

  it("sem In-Reply-To ainda é candidata (o casamento por remetente decide depois)", () => {
    expect(classificarMensagem(msg({ assunto: "Oi!" }), CAIXA)).toEqual({ tipo: "resposta", referencias: [], de: "marlon@topflex.net" });
  });

  it("resposta automática (férias) não conta como resposta", () => {
    expect(classificarMensagem(msg({ cabecalhos: { "auto-submitted": "auto-replied", "in-reply-to": ENVIO } }), CAIXA).tipo).toBe(
      "automatica",
    );
    expect(classificarMensagem(msg({ assunto: "Resposta automática: Ideia para a Topflex" }), CAIXA).tipo).toBe("automatica");
    expect(classificarMensagem(msg({ assunto: "Automatic reply: Ideia" }), CAIXA).tipo).toBe("automatica");
    expect(classificarMensagem(msg({ cabecalhos: { "x-autoreply": "yes" } }), CAIXA).tipo).toBe("automatica");
    // "Auto-Submitted: no" é mensagem normal
    expect(classificarMensagem(msg({ cabecalhos: { "auto-submitted": "no" } }), CAIXA).tipo).toBe("resposta");
  });

  it("mensagem da própria caixa é ignorada", () => {
    expect(classificarMensagem(msg({ de: CAIXA }), "Hello@AgenciaByte.com").tipo).toBe("ignorar");
  });
});

describe("classificarMensagem — bounce", () => {
  it("relatório DSN do Postfix: destinatário, status 5.x.x permanente e o Message-ID do envio", () => {
    const m = msg({
      de: "mailer-daemon@smtp.umbler.com",
      assunto: "Undelivered Mail Returned to Sender",
      cabecalhos: {
        "content-type": 'multipart/report; report-type=delivery-status; boundary="BOUNDARY"',
        "message-id": "<20261005120000.ABC@smtp.umbler.com>",
      },
      corpo: DSN_POSTFIX,
    });
    expect(classificarMensagem(m, CAIXA)).toEqual({
      tipo: "bounce",
      destinatarios: ["naoexiste@topflex.net"],
      referencias: [ENVIO],
      permanente: true,
      status: "5.1.1",
    });
  });

  it("aviso de atraso (4.x.x / delayed) não é permanente", () => {
    const corpo = "Final-Recipient: rfc822; lento@x.com\r\nAction: delayed\r\nStatus: 4.4.1\r\n";
    const r = lerRelatorioDeEntrega(corpo, { assunto: "Delayed Mail (still being retried)", cabecalhos: {} });
    expect(r.permanente).toBe(false);
    expect(r.status).toBe("4.4.1");
  });

  it("devolução sem relatório (Gmail): X-Failed-Recipients e remetente do sistema", () => {
    const m = msg({
      de: "mailer-daemon@googlemail.com",
      assunto: "Delivery Status Notification (Failure)",
      cabecalhos: { "x-failed-recipients": "sumiu@cliente.com.br" },
      corpo: `Address not found\r\n\r\n----- Original message -----\r\nMessage-ID: ${ENVIO}\r\nSubject: Ideia\r\n`,
    });
    const c = classificarMensagem(m, CAIXA);
    expect(c).toMatchObject({ tipo: "bounce", destinatarios: ["sumiu@cliente.com.br"], referencias: [ENVIO], permanente: true });
  });

  it("remetente comum com assunto parecido não é bounce", () => {
    expect(pareceBounce(msg({ assunto: "Re: não foi possível entregar o pedido" }))).toBe(false);
    expect(pareceBounce(msg({ de: "postmaster@topflex.net", assunto: "x" }))).toBe(true);
  });
});
