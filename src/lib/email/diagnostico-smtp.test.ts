import { describe, expect, it } from "vitest";
import { imapIndisponivel, mensagemDeFalhaSmtp } from "./diagnostico-smtp";

const O365 = "smtp.office365.com";

describe("mensagemDeFalhaSmtp", () => {
  it("SMTP AUTH desligado no tenant/caixa", () => {
    const m = mensagemDeFalhaSmtp(
      O365,
      "authentication_failed",
      "Invalid login: 535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.",
    );
    expect(m).toContain("SMTP autenticado");
    expect(m).toContain("5.7.139");
  });
  it("padrões de segurança", () => {
    const m = mensagemDeFalhaSmtp(
      O365,
      "authentication_failed",
      "535 5.7.139 Authentication unsuccessful, user is locked by your organization's security defaults policy.",
    );
    expect(m).toContain("Padrões de segurança");
  });
  it("basic auth aposentado", () => {
    expect(mensagemDeFalhaSmtp(O365, "authentication_failed", "550 5.7.30 Basic authentication is not supported")).toContain(
      "só OAuth",
    );
  });
  it("senha errada no 365 traz o checklist e a resposta", () => {
    const m = mensagemDeFalhaSmtp(O365, "authentication_failed", "535 5.7.3 Authentication unsuccessful");
    expect(m).toContain("e-mail completo");
    expect(m).toContain("5.7.3");
  });
  it("outros provedores: mensagem de antes + resposta do servidor", () => {
    expect(mensagemDeFalhaSmtp("smtp.zoho.com", "authentication_failed", "535 bad")).toBe(
      "Usuário ou senha recusados pelo servidor. No Gmail/Outlook use uma senha de app. (resposta do servidor: 535 bad)",
    );
  });
});

it("imapIndisponivel só para Microsoft", () => {
  expect(imapIndisponivel("outlook.office365.com")).toContain("OAuth");
  expect(imapIndisponivel("imap.gmail.com")).toBeNull();
  expect(imapIndisponivel(null)).toBeNull();
});
