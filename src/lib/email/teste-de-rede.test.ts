import dns from "dns/promises";
import net from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipDeSaidaPorSocket, portaComTlsDireto, testarPorta } from "./teste-de-rede";
import * as ssrf from "./ssrf";

let servidor: net.Server | null = null;
afterEach(() => {
  servidor?.close();
  servidor = null;
  vi.restoreAllMocks();
});

function subir(saudacao: string | null): Promise<number> {
  return new Promise((resolve) => {
    servidor = net.createServer((s) => {
      if (saudacao) s.write(saudacao);
    });
    servidor.listen(0, "127.0.0.1", () => resolve((servidor!.address() as net.AddressInfo).port));
  });
}

describe("testarPorta", () => {
  it("conecta e lê a saudação do servidor", async () => {
    vi.spyOn(ssrf, "ipEInterno").mockReturnValue(false); // o servidor de teste é local
    const porta = await subir("220 smtp.teste ESMTP pronto\r\n250 mais\r\n");
    const r = await testarPorta("127.0.0.1", porta, 3000);
    expect(r).toMatchObject({ resultado: "conectou", saudacao: "220 smtp.teste ESMTP pronto", erro: null, tls: false });
  });

  it("conectou sem saudação: avisa em vez de dizer que falhou", async () => {
    vi.spyOn(ssrf, "ipEInterno").mockReturnValue(false);
    const porta = await subir(null);
    const r = await testarPorta("127.0.0.1", porta, 300);
    expect(r.resultado).toBe("conectou");
    expect(r.erro).toMatch(/saudação/);
  });

  it("via ip conecta no IP resolvido", async () => {
    vi.spyOn(ssrf, "ipEInterno").mockReturnValue(false);
    const porta = await subir("220 pronto\r\n");
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    const r = await testarPorta("smtp.teste", porta, 3000, "ip");
    expect(r).toMatchObject({ via: "ip", resultado: "conectou", saudacao: "220 pronto" });
  });

  it("recusa host interno sem conectar", async () => {
    const r = await testarPorta("127.0.0.1", 25, 300);
    expect(r).toMatchObject({ resultado: "falhou", erro: "Host aponta para endereço interno." });
  });

  it("465 e 993 são TLS direto", () => {
    expect(portaComTlsDireto(465)).toBe(true);
    expect(portaComTlsDireto(993)).toBe(true);
    expect(portaComTlsDireto(587)).toBe(false);
  });
});

describe("ipDeSaidaPorSocket", () => {
  function subirHttp(corpo: string): Promise<number> {
    return new Promise((resolve) => {
      servidor = net.createServer((s) => s.once("data", () => s.end(`HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\n${corpo}`)));
      servidor.listen(0, "127.0.0.1", () => resolve((servidor!.address() as net.AddressInfo).port));
    });
  }

  it("lê o IP do corpo da resposta", async () => {
    const porta = await subirHttp("203.0.113.7");
    expect(await ipDeSaidaPorSocket("127.0.0.1", porta, 3000, false)).toMatchObject({ ip: "203.0.113.7", erro: null });
  });

  it("corpo que não é IP vira erro", async () => {
    const porta = await subirHttp("<html>bloqueado</html>");
    const r = await ipDeSaidaPorSocket("127.0.0.1", porta, 3000, false);
    expect(r.ip).toBeNull();
    expect(r.erro).toMatch(/inesperada/);
  });
});
