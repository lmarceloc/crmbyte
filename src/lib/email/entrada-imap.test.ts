import { describe, expect, it } from "vitest";
import { lerCaixaDeEntrada, type ClienteImapLeitura } from "./entrada-imap";
import type { ConfigImap } from "./imap";

const cfg: ConfigImap = {
  host: "imap.umbler.com",
  port: 993,
  security: "tls",
  username: "hello@agenciabyte.com",
  password: "segredo",
  pastaEnviados: null,
};

interface Guardada {
  uid: number;
  data: Date;
  de: string;
  assunto: string;
  cabecalhos: string;
  fonte?: string;
}

/** INBOX falsa: UIDs crescentes, busca por data e por faixa de UID ("N:*"). */
function caixaFalsa(mensagens: Guardada[], uidValidity: bigint = BigInt(7)) {
  const chamadas: string[] = [];
  const uidNext = Math.max(0, ...mensagens.map((m) => m.uid)) + 1;
  const cliente: ClienteImapLeitura = {
    on: () => undefined,
    connect: async () => undefined,
    logout: async () => undefined,
    close: () => undefined,
    list: async () => [],
    append: async () => true,
    mailboxOpen: async (path, op) => {
      chamadas.push(`open ${path} ro=${op?.readOnly}`);
      return { uidValidity, uidNext };
    },
    search: async (q) => {
      if (q.since) return mensagens.filter((m) => m.data >= q.since!).map((m) => m.uid);
      const [de] = (q.uid ?? "").split(":");
      const acima = mensagens.filter((m) => m.uid >= Number(de)).map((m) => m.uid);
      // como num servidor real: "N:*" sem nada acima de N devolve a última
      return acima.length ? acima : mensagens.slice(-1).map((m) => m.uid);
    },
    fetchAll: async (faixa) => {
      chamadas.push(`fetch ${faixa}`);
      const uids = faixa.split(",").map(Number);
      return mensagens
        .filter((m) => uids.includes(m.uid))
        .map((m) => ({
          uid: m.uid,
          envelope: { date: m.data, subject: m.assunto, from: [{ address: m.de }] },
          headers: Buffer.from(m.cabecalhos),
        }));
    },
    fetchOne: async (uid, q) => {
      chamadas.push(`source ${uid} max=${q.source.maxLength}`);
      const m = mensagens.find((x) => x.uid === Number(uid));
      return m ? { uid: m.uid, source: Buffer.from(m.fonte ?? "") } : false;
    },
  };
  return { cliente, chamadas };
}

const deps = (cliente: ClienteImapLeitura) => ({ criarCliente: () => cliente, validarDestino: async () => undefined });
const agora = new Date("2026-10-05T12:00:00Z");
const dia = (d: number) => new Date(agora.getTime() - d * 86_400_000);

const MENSAGENS: Guardada[] = [
  { uid: 3, data: dia(30), de: "antigo@x.com", assunto: "Velha", cabecalhos: "" },
  { uid: 8, data: dia(2), de: "Marlon@Topflex.net", assunto: "Re: Ideia", cabecalhos: "In-Reply-To: <e1@agenciabyte.com>\r\n" },
  {
    uid: 9,
    data: dia(1),
    de: "MAILER-DAEMON@smtp.umbler.com",
    assunto: "Undelivered Mail Returned to Sender",
    cabecalhos: "Content-Type: multipart/report; report-type=delivery-status;\r\n boundary=x\r\n",
    fonte: "Final-Recipient: rfc822; sumiu@x.com\r\nStatus: 5.1.1\r\n",
  },
];

describe("lerCaixaDeEntrada", () => {
  it("primeira leitura: só os últimos 14 dias, abre a INBOX em modo leitura e baixa o MIME só dos bounces", async () => {
    const { cliente, chamadas } = caixaFalsa(MENSAGENS);
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: null, ultimoUid: null }, { agora }, deps(cliente));
    if (!r.ok) throw new Error(r.erro);
    expect(r.estado).toEqual({ uidValidity: 7, ultimoUid: 9 });
    expect(r.mensagens.map((m) => m.uid)).toEqual([8, 9]);
    expect(r.mensagens[0]).toMatchObject({ de: "marlon@topflex.net", assunto: "Re: Ideia" });
    expect(r.mensagens[0].cabecalhos["in-reply-to"]).toBe("<e1@agenciabyte.com>");
    expect(r.mensagens[0].corpo).toBeUndefined();
    expect(r.mensagens[1].corpo).toContain("Final-Recipient");
    expect(chamadas).toEqual(["open INBOX ro=true", "fetch 8,9", "source 9 max=65536"]);
  });

  it("continua de onde parou e não relê nada quando não chegou mensagem nova", async () => {
    const { cliente, chamadas } = caixaFalsa(MENSAGENS);
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: 7, ultimoUid: 9 }, { agora }, deps(cliente));
    expect(r).toEqual({ ok: true, estado: { uidValidity: 7, ultimoUid: 9 }, mensagens: [] });
    expect(chamadas).toEqual(["open INBOX ro=true"]);
  });

  it("lê só as novas (o '*' que devolve a última já lida é descartado)", async () => {
    const novas = [...MENSAGENS, { uid: 12, data: dia(0), de: "ana@y.com", assunto: "Re: oi", cabecalhos: "" }];
    const { cliente } = caixaFalsa(novas);
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: 7, ultimoUid: 9 }, { agora }, deps(cliente));
    if (!r.ok) throw new Error(r.erro);
    expect(r.mensagens.map((m) => m.uid)).toEqual([12]);
    expect(r.estado.ultimoUid).toBe(12);
  });

  it("muitas novas: processa as mais antigas e deixa o resto para o próximo ciclo", async () => {
    const muitas = Array.from({ length: 5 }, (_, i) => ({ uid: 20 + i, data: dia(0), de: "a@b.com", assunto: "x", cabecalhos: "" }));
    const { cliente } = caixaFalsa(muitas);
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: 7, ultimoUid: 19 }, { agora, max: 2 }, deps(cliente));
    if (!r.ok) throw new Error(r.erro);
    expect(r.mensagens.map((m) => m.uid)).toEqual([20, 21]);
    expect(r.estado.ultimoUid).toBe(21);
  });

  it("UIDVALIDITY mudou: recomeça pela janela de dias", async () => {
    const { cliente } = caixaFalsa(MENSAGENS, BigInt(99));
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: 7, ultimoUid: 50 }, { agora }, deps(cliente));
    if (!r.ok) throw new Error(r.erro);
    expect(r.estado).toEqual({ uidValidity: 99, ultimoUid: 9 });
    expect(r.mensagens.map((m) => m.uid)).toEqual([8, 9]);
  });

  it("falha de conexão vira erro devolvido, sem lançar", async () => {
    const { cliente } = caixaFalsa(MENSAGENS);
    cliente.connect = async () => {
      throw Object.assign(new Error("x"), { responseText: "Login failed" });
    };
    const r = await lerCaixaDeEntrada(cfg, { uidValidity: null, ultimoUid: null }, { agora }, deps(cliente));
    expect(r).toEqual({ ok: false, erro: "Login failed" });
  });
});
