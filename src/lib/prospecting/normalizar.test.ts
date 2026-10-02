import { describe, expect, it } from "vitest";
import { normalizarTelefoneBr, normalizeProspect } from "./apify";
import { normalizeLead } from "./treg";

describe("normalizarTelefoneBr", () => {
  it("prefixa 55 em 10/11 dígitos e recusa estrangeiro", () => {
    expect(normalizarTelefoneBr("(11) 91234-5678")).toBe("+5511912345678");
    expect(normalizarTelefoneBr("+1 415 555 0100")).toBeNull();
    expect(normalizarTelefoneBr("123")).toBeNull();
  });
});

describe("normalizeProspect", () => {
  it("descarta fechado ou sem placeId", () => {
    expect(normalizeProspect({ title: "A", placeId: "p", permanentlyClosed: true })).toBeNull();
    expect(normalizeProspect({ title: "A" })).toBeNull();
    expect(normalizeProspect({ title: "A", placeId: "p", phone: "11 3333-4444" })?.phone).toBe("+551133334444");
  });
});

describe("normalizeLead", () => {
  it("lida com formatos de provedores diferentes", () => {
    const a = normalizeLead({ id: 7, fullName: "Ana Lima", jobTitle: { title: "CTO" }, company: { name: "X", domain: "https://x.com.br/a" } });
    expect(a).toMatchObject({ key: "7", title: "CTO", companyName: "X", companyDomain: "x.com.br" });
    const b = normalizeLead({ first_name: "Bia", last_name: "Souza", company_url: "https://www.y.com/" });
    expect(b?.fullName).toBe("Bia Souza");
    expect(b?.key).toBe("Bia Souza:www.y.com");
    expect(normalizeLead({ title: "sem nome" })).toBeNull();
  });
});
