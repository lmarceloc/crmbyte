import { describe, expect, it } from "vitest";
import { assinaturaEmTexto, sanitizarAssinatura } from "./assinatura";

describe("assinatura", () => {
  it("remove script, on*= e javascript:", () => {
    const s = sanitizarAssinatura('<p onclick="x()">oi</p><script>alert(1)</script><a href="javascript:x()">l</a>');
    expect(s).not.toMatch(/script|onclick|javascript:/i);
  });
  it("imagem só https; link ganha rel/target", () => {
    expect(sanitizarAssinatura('<img src="http://x/y.png">')).not.toContain("src");
    expect(sanitizarAssinatura('<a href="https://a.com">a</a>')).toContain('rel="noopener noreferrer"');
  });
  it("texto decodifica &amp; por último", () => {
    expect(assinaturaEmTexto("<p>a &amp;lt; b</p>")).toBe("a &lt; b");
  });
});
