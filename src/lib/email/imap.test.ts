import { describe, expect, it, vi } from "vitest";
import {
  copiarParaEnviados,
  escolherPastaEnviados,
  verificarImap,
  type ClienteImap,
  type ConfigImap,
  type PastaImap,
} from "./imap";

const cfg: ConfigImap = {
  host: "imap.umbler.com",
  port: 993,
  security: "tls",
  username: "hello@agenciabyte.com",
  password: "segredo",
  pastaEnviados: null,
};

const pasta = (path: string, extra: Partial<PastaImap> = {}): PastaImap => ({ path, ...extra });

describe("escolherPastaEnviados", () => {
  it("prefere a pasta que o servidor marca como \\Sent, mesmo com nome diferente", () => {
    const pastas = [pasta("INBOX"), pasta("Rascunhos"), pasta("Mandadas", { specialUse: "\\Sent" })];
    expect(escolherPastaEnviados(pastas)).toBe("Mandadas");
  });

  it("aceita a marca \\Sent vinda só nos flags", () => {
    expect(escolherPastaEnviados([pasta("INBOX"), pasta("Out", { flags: ["\\HasNoChildren", "\\Sent"] })])).toBe("Out");
  });

  it("sem marcação, cai nos nomes comuns (sem diferenciar caixa)", () => {
    expect(escolherPastaEnviados([pasta("INBOX"), pasta("ENVIADOS")])).toBe("ENVIADOS");
    expect(escolherPastaEnviados([pasta("INBOX"), pasta("INBOX.Sent")])).toBe("INBOX.Sent");
    expect(escolherPastaEnviados([pasta("INBOX"), pasta("Itens Enviados")])).toBe("Itens Enviados");
  });

  it("a pasta informada vale mais que a detectada", () => {
    const pastas = [pasta("Sent", { specialUse: "\\Sent" }), pasta("Clientes/Enviados")];
    expect(escolherPastaEnviados(pastas, "Clientes/Enviados")).toBe("Clientes/Enviados");
    expect(escolherPastaEnviados(pastas, "clientes/enviados")).toBe("Clientes/Enviados");
  });

  it("pasta informada que não existe devolve null (não cai na detecção)", () => {
    expect(escolherPastaEnviados([pasta("Sent", { specialUse: "\\Sent" })], "Outra")).toBeNull();
  });

  it("ignora pasta que não aceita mensagens (\\Noselect)", () => {
    expect(escolherPastaEnviados([pasta("Sent", { flags: ["\\Noselect"] })])).toBeNull();
  });

  it("devolve null quando não há nada parecido", () => {
    expect(escolherPastaEnviados([pasta("INBOX"), pasta("Spam")])).toBeNull();
  });
});

function falso(over: Partial<ClienteImap> = {}) {
  const chamadas: string[] = [];
  const cliente: ClienteImap = {
    on: vi.fn(),
    connect: vi.fn(async () => void chamadas.push("connect")),
    list: vi.fn(async () => [pasta("INBOX"), pasta("Sent", { specialUse: "\\Sent" })]),
    append: vi.fn(async (destino: string) => {
      chamadas.push(`append:${destino}`);
      return { destination: destino };
    }),
    logout: vi.fn(async () => void chamadas.push("logout")),
    close: vi.fn(() => void chamadas.push("close")),
    ...over,
  };
  return { cliente, chamadas, deps: { criarCliente: () => cliente, validarDestino: async () => undefined } };
}

const MENSAGEM = Buffer.from("From: a@b.c\r\nSubject: oi\r\n\r\ncorpo");

describe("copiarParaEnviados", () => {
  it("grava na pasta de enviados, marcada como lida, e fecha a conexão", async () => {
    const { cliente, chamadas, deps } = falso();
    const r = await copiarParaEnviados(cfg, MENSAGEM, deps);
    expect(r).toEqual({ ok: true, pasta: "Sent" });
    expect(cliente.append).toHaveBeenCalledWith("Sent", MENSAGEM, ["\\Seen"], expect.any(Date));
    expect(chamadas).toEqual(["connect", "append:Sent", "logout", "close"]);
  });

  it("não lança quando a conexão falha: devolve o erro", async () => {
    const { deps } = falso({ connect: async () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(await copiarParaEnviados(cfg, MENSAGEM, deps)).toEqual({ ok: false, erro: "ECONNREFUSED" });
  });

  it("usa o texto de resposta do servidor quando existe", async () => {
    const erro = Object.assign(new Error("Command failed"), { responseText: "Invalid credentials" });
    const { deps } = falso({ connect: async () => Promise.reject(erro) });
    expect(await copiarParaEnviados(cfg, MENSAGEM, deps)).toEqual({ ok: false, erro: "Invalid credentials" });
  });

  it("avisa quando não acha a pasta e não tenta gravar", async () => {
    const { cliente, deps } = falso({ list: async () => [pasta("INBOX")] });
    const r = await copiarParaEnviados(cfg, MENSAGEM, deps);
    expect(r.ok).toBe(false);
    expect(cliente.append).not.toHaveBeenCalled();
  });

  it("trata o servidor recusar a gravação (append devolve false) como erro", async () => {
    const { deps } = falso({ append: async () => false });
    expect(await copiarParaEnviados(cfg, MENSAGEM, deps)).toEqual({
      ok: false,
      erro: "O servidor recusou gravar a mensagem.",
    });
  });

  it("não conecta quando o destino é recusado pela checagem anti-SSRF", async () => {
    const { cliente, deps } = falso();
    const r = await copiarParaEnviados(cfg, MENSAGEM, {
      ...deps,
      validarDestino: async () => Promise.reject(new Error("destino interno")),
    });
    expect(r).toEqual({ ok: false, erro: "destino interno" });
    expect(cliente.connect).not.toHaveBeenCalled();
  });

  it("desiste quando o servidor demora demais e ainda fecha a conexão", async () => {
    const { cliente, deps } = falso({ connect: () => new Promise<void>(() => undefined) });
    const r = await copiarParaEnviados(cfg, MENSAGEM, { ...deps, limiteMs: 20 });
    expect(r).toEqual({ ok: false, erro: "Tempo esgotado ao falar com o servidor IMAP." });
    expect(cliente.close).toHaveBeenCalled();
  });

  it("ignora erro ao encerrar a sessão (a mensagem já foi gravada)", async () => {
    const { deps } = falso({ logout: async () => Promise.reject(new Error("socket fechado")) });
    expect(await copiarParaEnviados(cfg, MENSAGEM, deps)).toEqual({ ok: true, pasta: "Sent" });
  });

  it("respeita a pasta configurada", async () => {
    const { cliente, deps } = falso({ list: async () => [pasta("INBOX"), pasta("Sent"), pasta("Vendas/Enviados")] });
    const r = await copiarParaEnviados({ ...cfg, pastaEnviados: "Vendas/Enviados" }, MENSAGEM, deps);
    expect(r).toEqual({ ok: true, pasta: "Vendas/Enviados" });
    expect(cliente.append).toHaveBeenCalledWith("Vendas/Enviados", MENSAGEM, ["\\Seen"], expect.any(Date));
  });
});

describe("verificarImap", () => {
  it("confirma login e pasta sem gravar nada", async () => {
    const { cliente, deps } = falso();
    expect(await verificarImap(cfg, deps)).toEqual({ ok: true, pasta: "Sent" });
    expect(cliente.append).not.toHaveBeenCalled();
  });

  it("separa senha recusada de falha de conexão", async () => {
    const auth = Object.assign(new Error("Command failed"), { authenticationFailed: true, responseText: "AUTHENTICATIONFAILED" });
    const a = falso({ connect: async () => Promise.reject(auth) });
    expect(await verificarImap(cfg, a.deps)).toEqual({ ok: false, tipo: "authentication_failed", detalhe: "AUTHENTICATIONFAILED" });
    const b = falso({ connect: async () => Promise.reject(new Error("getaddrinfo ENOTFOUND")) });
    expect(await verificarImap(cfg, b.deps)).toEqual({ ok: false, tipo: "connection_failed", detalhe: "getaddrinfo ENOTFOUND" });
  });

  it("avisa quando a pasta não existe", async () => {
    const { deps } = falso({ list: async () => [pasta("INBOX")] });
    const r = await verificarImap(cfg, deps);
    expect(r).toMatchObject({ ok: false, tipo: "folder_not_found" });
    const informada = await verificarImap({ ...cfg, pastaEnviados: "Nada" }, deps);
    expect(informada).toMatchObject({ ok: false, tipo: "folder_not_found", detalhe: 'A pasta "Nada" não existe nesta caixa.' });
  });
});
