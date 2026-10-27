// Teste de rede de servidor SMTP/IMAP a partir de onde o CRM roda (Cloudflare Workers):
// abre um socket TCP puro e lê a saudação do servidor ("220 …" no SMTP, "* OK …" no IMAP),
// sem usuário nem senha. Serve para o suporte do provedor ver onde a conexão para.
import dns from "dns/promises";
import net from "net";
import tls from "tls";
import { ipEInterno } from "./ssrf";

export interface ResultadoDoTeste {
  host: string;
  porta: number;
  /** IPs que o DNS devolveu para o host. */
  ips: string[];
  tls: boolean;
  resultado: "conectou" | "falhou";
  /** Tempo até a conexão abrir (ou até falhar). */
  ms: number;
  /** Primeira linha que o servidor mandou, se mandou. */
  saudacao: string | null;
  erro: string | null;
  inicio: string;
}

/** 465 e 993 são TLS desde o primeiro byte; as demais começam em texto (STARTTLS depois). */
export const portaComTlsDireto = (porta: number) => porta === 465 || porta === 993;

export async function testarPorta(host: string, porta: number, limiteMs = 10_000): Promise<ResultadoDoTeste> {
  const inicio = new Date();
  const usaTls = portaComTlsDireto(porta);
  const base = { host, porta, tls: usaTls, inicio: inicio.toISOString() };
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (ips.length === 0) return { ...base, ips, resultado: "falhou", ms: 0, saudacao: null, erro: "DNS não resolveu o host." };
  if (ips.some(ipEInterno)) return { ...base, ips, resultado: "falhou", ms: 0, saudacao: null, erro: "Host aponta para endereço interno." };

  return new Promise((resolve) => {
    let conectouEm: number | null = null;
    let fim = false;
    // conecta pelo NOME (como um cliente de e-mail), não pelo IP resolvido
    const socket = usaTls ? tls.connect({ host, port: porta, servername: host }) : net.connect({ host, port: porta });
    const terminar = (r: Pick<ResultadoDoTeste, "resultado" | "saudacao" | "erro">) => {
      if (fim) return;
      fim = true;
      clearTimeout(relogio);
      socket.destroy();
      resolve({ ...base, ips, ms: (conectouEm ?? Date.now()) - inicio.getTime(), ...r });
    };
    const relogio = setTimeout(
      () =>
        terminar(
          conectouEm
            ? { resultado: "conectou", saudacao: null, erro: "Conectou, mas o servidor não mandou saudação a tempo." }
            : { resultado: "falhou", saudacao: null, erro: `Sem conexão em ${limiteMs / 1000}s (timeout).` },
        ),
      limiteMs,
    );
    socket.once(usaTls ? "secureConnect" : "connect", () => {
      conectouEm = Date.now();
    });
    socket.once("data", (d: Buffer) => {
      conectouEm ??= Date.now();
      terminar({ resultado: "conectou", saudacao: d.toString("utf8").split(/\r?\n/)[0].slice(0, 200), erro: null });
    });
    socket.once("error", (e: Error) => terminar({ resultado: "falhou", saudacao: null, erro: e.message.slice(0, 300) }));
  });
}
