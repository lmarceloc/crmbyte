import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conferirRetorno, iniciarLogin, MicrosoftError, urlDeRetorno } from "./microsoft";

const SESSAO = { accountId: "11111111-1111-1111-1111-111111111111", userId: "22222222-2222-2222-2222-222222222222" };
const ORIGEM = "https://crm.agenciabyte.com";

beforeEach(() => {
  vi.stubEnv("MICROSOFT_CLIENT_ID", "656e535b-865b-46cf-b6f3-bc34e97cd075");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "segredo");
});
afterEach(() => vi.unstubAllEnvs());

describe("login com a Microsoft", () => {
  it("monta a URL multiempresa com PKCE e a URI de retorno exata", () => {
    const { url } = iniciarLogin({ ...SESSAO, ownerUserId: null }, ORIGEM);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe("https://crm.agenciabyte.com/api/microsoft/callback");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("Mail.Send");
    expect(u.searchParams.get("scope")).toContain("offline_access");
  });

  it("aceita o retorno do mesmo usuário/conta/navegador", () => {
    const { url, cookie } = iniciarLogin({ ...SESSAO, ownerUserId: "33333333-3333-3333-3333-333333333333" }, ORIGEM);
    const state = new URL(url).searchParams.get("state");
    const r = conferirRetorno(state, cookie, SESSAO);
    expect(r.estado.ownerUserId).toBe("33333333-3333-3333-3333-333333333333");
    expect(r.verificador.length).toBeGreaterThan(30);
  });

  it("recusa outra conta, outro usuário, outro navegador e login vencido", () => {
    const a = iniciarLogin({ ...SESSAO, ownerUserId: null }, ORIGEM);
    const b = iniciarLogin({ ...SESSAO, ownerUserId: null }, ORIGEM);
    const state = new URL(a.url).searchParams.get("state");
    expect(() => conferirRetorno(state, a.cookie, { ...SESSAO, accountId: "outra" })).toThrow(MicrosoftError);
    expect(() => conferirRetorno(state, a.cookie, { ...SESSAO, userId: "outro" })).toThrow(MicrosoftError);
    expect(() => conferirRetorno(state, b.cookie, SESSAO)).toThrow(/navegador/);
    expect(() => conferirRetorno(state, a.cookie, SESSAO, Date.now() + 11 * 60_000)).toThrow(/expirado/);
    expect(() => conferirRetorno("lixo", a.cookie, SESSAO)).toThrow(MicrosoftError);
    expect(() => conferirRetorno(state, undefined, SESSAO)).toThrow(MicrosoftError);
  });

  it("sem credenciais do app, explica", () => {
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    expect(() => iniciarLogin({ ...SESSAO, ownerUserId: null }, ORIGEM)).toThrow(/não configurado/);
  });

  it("MICROSOFT_REDIRECT_URI sobrepõe a origem", () => {
    vi.stubEnv("MICROSOFT_REDIRECT_URI", "https://x.test/cb");
    expect(urlDeRetorno(ORIGEM)).toBe("https://x.test/cb");
  });
});
