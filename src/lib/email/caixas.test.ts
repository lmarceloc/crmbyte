import { describe, expect, it } from "vitest";
import { caixaInputSchema, montarConfigImap } from "./caixas";

const base = {
  email: "hello@agenciabyte.com",
  smtp_host: "smtp.umbler.com",
};

describe("caixaInputSchema — IMAP", () => {
  it("sem campos de IMAP, a cópia em Enviados fica desligada (caixas antigas seguem iguais)", () => {
    const r = caixaInputSchema.parse(base);
    expect(r.imap_host).toBeNull();
    expect(r.imap_port).toBe(993);
    expect(r.imap_security).toBe("tls");
    expect(r.imap_sent_folder).toBeNull();
  });

  it("aceita o IMAP da Umbler", () => {
    const r = caixaInputSchema.parse({ ...base, imap_host: "imap.umbler.com", imap_port: 993, imap_security: "tls" });
    expect(r.imap_host).toBe("imap.umbler.com");
  });

  it("texto vazio em servidor e pasta vira null", () => {
    const r = caixaInputSchema.parse({ ...base, imap_host: "", imap_sent_folder: "  " });
    expect(r.imap_host).toBeNull();
    expect(r.imap_sent_folder).toBeNull();
  });

  it("recusa servidor com caracteres inválidos, porta fora da faixa e IMAP sem criptografia", () => {
    expect(caixaInputSchema.safeParse({ ...base, imap_host: "imap.x.com/../etc" }).success).toBe(false);
    expect(caixaInputSchema.safeParse({ ...base, imap_host: "imap.x.com", imap_port: 70000 }).success).toBe(false);
    expect(caixaInputSchema.safeParse({ ...base, imap_host: "imap.x.com", imap_security: "none" }).success).toBe(false);
  });
});

describe("montarConfigImap", () => {
  const c = {
    imapHost: "imap.umbler.com",
    imapPort: 993,
    imapSecurity: "tls",
    pastaEnviados: null,
    smtpUsername: "hello@agenciabyte.com",
    email: "hello@agenciabyte.com",
    password: "segredo",
  };

  it("reaproveita usuário e senha do SMTP", () => {
    expect(montarConfigImap(c)).toEqual({
      host: "imap.umbler.com",
      port: 993,
      security: "tls",
      username: "hello@agenciabyte.com",
      password: "segredo",
      pastaEnviados: null,
    });
  });

  it("sem usuário SMTP, usa o e-mail da caixa", () => {
    expect(montarConfigImap({ ...c, smtpUsername: "  ", email: "vendas@x.com" })?.username).toBe("vendas@x.com");
  });

  it("devolve null (desligado) sem servidor IMAP ou sem senha", () => {
    expect(montarConfigImap({ ...c, imapHost: null })).toBeNull();
    expect(montarConfigImap({ ...c, imapHost: "" })).toBeNull();
    expect(montarConfigImap({ ...c, imapHost: undefined })).toBeNull();
    expect(montarConfigImap({ ...c, password: "" })).toBeNull();
  });

  it("segurança desconhecida vira TLS; STARTTLS e a pasta são mantidos", () => {
    expect(montarConfigImap({ ...c, imapSecurity: "none" })?.security).toBe("tls");
    const r = montarConfigImap({ ...c, imapPort: 143, imapSecurity: "starttls", pastaEnviados: " Vendas/Enviados " });
    expect(r).toMatchObject({ port: 143, security: "starttls", pastaEnviados: "Vendas/Enviados" });
  });
});
