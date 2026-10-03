import { describe, expect, it } from "vitest";
import { corpoEmHtml, corpoEmTexto, escaparMarkdown } from "./corpo-rico";

describe("corpoEmHtml", () => {
  it("texto simples continua igual: escapa HTML e quebra linha em <br>", () => {
    expect(corpoEmHtml("<b>a</b>\nb")).toBe("&lt;b&gt;a&lt;/b&gt;<br>\nb");
  });

  it("negrito e link com texto", () => {
    expect(corpoEmHtml("Olá **Ana**, veja a [agenda](https://cal.com/x?a=1&b=2).")).toBe(
      'Olá <strong>Ana</strong>, veja a <a href="https://cal.com/x?a=1&amp;b=2">agenda</a>.',
    );
  });

  it("só aceita links http(s) e mailto", () => {
    expect(corpoEmHtml("[x](javascript:alert(1))")).not.toContain("<a");
    expect(corpoEmHtml("[x](mailto:a@b.com)")).toContain('href="mailto:a@b.com"');
  });

  it("URL solta vira link sem engolir a pontuação final", () => {
    expect(corpoEmHtml("veja https://a.com/x.")).toBe('veja <a href="https://a.com/x">https://a.com/x</a>.');
  });

  it("linkar troca o href (rastreio) em links markdown e URLs soltas, mas não em mailto", () => {
    const op = { linkar: (u: string) => `R/${u}` };
    const h = corpoEmHtml("[a](https://x.com) https://y.com [m](mailto:a@b.com)", op);
    expect(h).toContain('<a href="R/https://x.com">a</a>');
    expect(h).toContain('<a href="R/https://y.com">https://y.com</a>');
    expect(h).toContain('href="mailto:a@b.com"');
  });

  it("lista com - e *, aninhada por indentação", () => {
    const h = corpoEmHtml("Itens:\n* um\n  * um.a\n  - um.b\n* dois\nfim");
    expect(h).toBe(
      'Itens:\n<ul style="margin:8px 0;padding-left:24px"><li>um<ul style="margin:8px 0;padding-left:24px"><li>um.a</li><li>um.b</li></ul></li><li>dois</li></ul>\nfim',
    );
  });

  it("não pula níveis de lista", () => {
    expect(corpoEmHtml("- a\n        - b")).toContain("<li>a<ul");
  });

  it("**negrito** no começo da linha não vira lista", () => {
    expect(corpoEmHtml("**Atenção** agora")).toBe("<strong>Atenção</strong> agora");
  });

  it("valores escapados não viram marcação", () => {
    const nome = escaparMarkdown("Ana **[x](https://evil.com)**");
    const h = corpoEmHtml(`Oi ${nome}`);
    expect(h).not.toContain("<strong>");
    expect(h).not.toContain(">x</a>"); // sem link com texto disfarçado
    expect(h.startsWith("Oi Ana **[x](")).toBe(true);
  });
});

describe("corpoEmTexto", () => {
  it("remove marcas, mostra links e usa • nas listas", () => {
    expect(corpoEmTexto("**Oi** [agenda](https://c.com)\n- um\n  - dois")).toBe("Oi agenda (https://c.com)\n• um\n  • dois");
  });
});
