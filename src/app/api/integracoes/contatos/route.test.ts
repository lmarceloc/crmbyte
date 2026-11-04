import { beforeEach, describe, expect, it, vi } from "vitest";

const autenticar = vi.fn();
const importar = vi.fn();

vi.mock("@/lib/automations/admin-client", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/integracoes/api-keys", () => ({ autenticarChaveApi: (...a: unknown[]) => autenticar(...a) }));
vi.mock("@/lib/integracoes/importar-contatos", async (orig) => ({
  ...(await orig<typeof import("@/lib/integracoes/importar-contatos")>()),
  importarContatos: (...a: unknown[]) => importar(...a),
}));

import { POST } from "./route";

const conta = (acesso: string) => ({ keyId: "k", accountId: "a1", accountName: "Byte", userId: "u1", acesso });
const post = () =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ contatos: [{ name: "Ana", email: "a@x.com" }] }) }));

beforeEach(() => {
  autenticar.mockReset();
  importar.mockReset().mockResolvedValue([{ indice: 0, status: "criado", contact_id: "c1" }]);
});

describe("POST /api/integracoes/contatos e o nível da chave", () => {
  it.each(["entrada", "escrita"])("chave de %s continua mandando contatos", async (acesso) => {
    autenticar.mockResolvedValue(conta(acesso));
    expect((await post()).status).toBe(200);
    expect(importar).toHaveBeenCalledTimes(1);
  });

  it("chave só de leitura não grava contato", async () => {
    autenticar.mockResolvedValue(conta("leitura"));
    const r = await post();
    expect(r.status).toBe(403);
    expect(importar).not.toHaveBeenCalled();
  });

  it("sem chave: 401", async () => {
    autenticar.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });
});
