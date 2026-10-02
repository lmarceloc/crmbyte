import { describe, expect, it } from "vitest";
import { linkWhatsapp, telefoneFormatado } from "./whatsapp-link";

describe("linkWhatsapp", () => {
  it("usa só dígitos e prefixa 55 em 10/11 dígitos", () => {
    expect(linkWhatsapp("(11) 91234-5678")).toBe("https://wa.me/5511912345678");
    expect(linkWhatsapp("11 3333-4444")).toBe("https://wa.me/551133334444");
  });
  it("mantém números que já têm DDI", () => {
    expect(linkWhatsapp("+55 11 91234-5678")).toBe("https://wa.me/5511912345678");
    expect(linkWhatsapp("+1 415 555 0100")).toBe("https://wa.me/14155550100");
  });
  it("vazio ou curto demais não vira link", () => {
    expect(linkWhatsapp("")).toBeNull();
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp(undefined)).toBeNull();
    expect(linkWhatsapp("123")).toBeNull();
  });
});

describe("telefoneFormatado", () => {
  it("mostra traço quando vazio", () => {
    expect(telefoneFormatado("")).toBe("—");
    expect(telefoneFormatado(" +55 11 9 ")).toBe("+55 11 9");
  });
});
