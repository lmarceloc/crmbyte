import { describe, expect, it } from "vitest";
import { ehRobo, paginaDeAbertura, tokenValido } from "./abertura";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("ehRobo", () => {
  it("navegador de gente não é robô", () => {
    expect(ehRobo(CHROME)).toBe(false);
    expect(ehRobo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 LinkedInApp")).toBe(false);
  });

  it("prévias de link, verificadores e user-agent vazio são robôs", () => {
    for (const ua of [
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "TelegramBot (like TwitterBot)",
      "Microsoft Office SafeLinks",
      "curl/8.4.0",
      "python-requests/2.31",
      "Mozilla/5.0 HeadlessChrome/120.0",
      "",
      null,
    ]) {
      expect(ehRobo(ua), String(ua)).toBe(true);
    }
  });
});

describe("tokenValido", () => {
  it("aceita só 32 caracteres hexadecimais", () => {
    expect(tokenValido("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(tokenValido("0123456789abcdef")).toBe(false);
    expect(tokenValido("0123456789abcdef0123456789abcdeg")).toBe(false);
    expect(tokenValido("../etc/passwd")).toBe(false);
  });
});

describe("paginaDeAbertura", () => {
  it("se envia sozinha por POST e tem botão para quem está sem JavaScript", () => {
    const html = paginaDeAbertura("Proposta.pdf");
    expect(html).toContain('<form method="post">');
    expect(html).toContain("document.forms[0].submit()");
    expect(html).toContain("Abrir arquivo");
    expect(html).toContain("noindex");
  });

  it("escapa o nome do arquivo", () => {
    const html = paginaDeAbertura('<script>alert("x")</script>.pdf');
    expect(html).not.toContain('<script>alert("x")');
    expect(html).toContain("&lt;script&gt;");
  });
});
