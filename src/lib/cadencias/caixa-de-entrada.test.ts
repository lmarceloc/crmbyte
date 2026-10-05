import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MensagemDaEntrada } from "@/lib/email/entrada";
import type { lerCaixaDeEntrada, ResultadoDaLeitura } from "@/lib/email/entrada-imap";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

type Linha = Record<string, unknown>;

/**
 * Supabase falso em memória, só com o que o módulo usa: filtros eq/in/is/gt/ilike/not/or,
 * caminho JSON `metadata->>x`, embed `email_cadences(...)`, update/insert com select.
 */
function bancoFalso(tabelas: Record<string, Linha[]>) {
  const valor = (l: Linha, col: string) => {
    const [base, chave] = col.split("->>");
    const v = l[base];
    return chave ? (v as Linha | undefined)?.[chave] : v;
  };
  const condicaoOr = (expr: string) => (l: Linha) =>
    expr.split(",").some((parte) => {
      const [col, op, ...resto] = parte.split(".");
      const alvo = resto.join(".");
      const v = l[col];
      if (op === "is" && alvo === "null") return v === null || v === undefined;
      if (op === "lt") return v !== null && v !== undefined && String(v) < alvo;
      throw new Error(`or não suportado: ${parte}`);
    });

  function consulta(tabela: string) {
    const filtros: ((l: Linha) => boolean)[] = [];
    let operacao: { tipo: "select" } | { tipo: "update"; dados: Linha } | { tipo: "insert"; dados: Linha } = { tipo: "select" };
    let colunas = "*";
    let limite: number | null = null;
    let ordem: { col: string; asc: boolean } | null = null;
    const linhas = () => (tabelas[tabela] ??= []);

    const executar = () => {
      if (operacao.tipo === "insert") {
        const nova = { id: `id-${linhas().length + 1}`, created_at: new Date().toISOString(), ...operacao.dados };
        linhas().push(nova);
        return [nova];
      }
      let alvo = linhas().filter((l) => filtros.every((f) => f(l)));
      if (operacao.tipo === "update") {
        for (const l of alvo) Object.assign(l, operacao.dados);
      }
      if (ordem) {
        const { col, asc } = ordem;
        alvo = [...alvo].sort((a, b) => {
          const x = a[col] ?? "";
          const y = b[col] ?? "";
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (limite !== null) alvo = alvo.slice(0, limite);
      return alvo.map((l) => {
        const copia: Linha = { ...l };
        if (colunas.includes("email_cadences(")) {
          copia.email_cadences = (tabelas.email_cadences ?? []).find((c) => c.id === l.cadence_id) ?? null;
        }
        return copia;
      });
    };

    const q = {
      select(c = "*") {
        colunas = c;
        return q;
      },
      update(dados: Linha) {
        operacao = { tipo: "update", dados };
        return q;
      },
      insert(dados: Linha) {
        operacao = { tipo: "insert", dados };
        return q;
      },
      eq(col: string, v: unknown) {
        filtros.push((l) => valor(l, col) === v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filtros.push((l) => vs.includes(valor(l, col)));
        return q;
      },
      is(col: string, v: null) {
        filtros.push((l) => (valor(l, col) ?? null) === v);
        return q;
      },
      gt(col: string, v: number) {
        filtros.push((l) => Number(valor(l, col)) > v);
        return q;
      },
      ilike(col: string, padrao: string) {
        const exato = padrao.replace(/\\(.)/g, "$1").toLowerCase();
        filtros.push((l) => String(valor(l, col) ?? "").toLowerCase() === exato);
        return q;
      },
      not(col: string, op: string, v: null) {
        if (op !== "is" || v !== null) throw new Error("not não suportado");
        filtros.push((l) => valor(l, col) !== null && valor(l, col) !== undefined);
        return q;
      },
      or(expr: string) {
        filtros.push(condicaoOr(expr));
        return q;
      },
      order(col: string, op?: { ascending?: boolean }) {
        ordem = { col, asc: op?.ascending !== false };
        return q;
      },
      limit(n: number) {
        limite = n;
        return q;
      },
      async maybeSingle() {
        const r = executar();
        return { data: r[0] ?? null, error: null };
      },
      then(ok: (v: { data: Linha[]; error: null }) => unknown, falha?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(ok({ data: executar(), error: null }));
        } catch (e) {
          return falha ? Promise.resolve(falha(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }
  return { from: consulta } as unknown as SupabaseClient;
}

const AGORA = new Date("2026-10-05T12:00:00Z");
const ENVIO_ANA = "<aaaa@agenciabyte.com>";
const ENVIO_BRUNO = "<bbbb@agenciabyte.com>";

async function cenario(opcoes: { paradaEmResposta?: boolean } = {}) {
  const { encrypt } = await import("@/lib/whatsapp/encryption");
  const tabelas: Record<string, Linha[]> = {
    email_mailboxes: [
      {
        id: "cx1",
        account_id: "acc",
        email: "hello@agenciabyte.com",
        smtp_username: "hello@agenciabyte.com",
        smtp_password_encrypted: encrypt("segredo"),
        imap_host: "imap.umbler.com",
        imap_port: 993,
        imap_security: "tls",
        imap_sent_folder: null,
        imap_inbox_uid_validity: 7,
        imap_inbox_last_uid: 100,
        imap_inbox_checked_at: null,
        imap_inbox_error: "erro antigo",
      },
      // sem IMAP: nunca é lida
      { id: "cx2", account_id: "acc", email: "x@y.com", imap_host: null, imap_inbox_checked_at: null },
    ],
    email_cadences: [
      {
        id: "cad",
        configuracao: { paradas: { respondeu: opcoes.paradaEmResposta ?? true, bounce: true, descadastro: true, ganhoOuPerdido: true } },
      },
    ],
    email_cadence_enrollments: [
      { id: "ins-ana", account_id: "acc", cadence_id: "cad", deal_id: "d1", contact_id: "ana", status: "ativa", emails_enviados: 1, respondeu_em: null, bounce_em: null },
      { id: "ins-bruno", account_id: "acc", cadence_id: "cad", deal_id: "d2", contact_id: "bruno", status: "ativa", emails_enviados: 1, respondeu_em: null, bounce_em: null },
      { id: "ins-carla", account_id: "acc", cadence_id: "cad", deal_id: "d3", contact_id: "carla", status: "ativa", emails_enviados: 0, respondeu_em: null, bounce_em: null },
    ],
    email_cadence_events: [
      { id: "e1", account_id: "acc", enrollment_id: "ins-ana", tipo: "email_enviado", metadata: { via: "caixa", caixa_id: "cx1", message_id: ENVIO_ANA } },
      { id: "e2", account_id: "acc", enrollment_id: "ins-bruno", tipo: "email_enviado", metadata: { via: "caixa", caixa_id: "cx1", message_id: ENVIO_BRUNO } },
    ],
    contacts: [
      { id: "ana", account_id: "acc", email: "Ana@Cliente.com", email_bounced_at: null },
      { id: "bruno", account_id: "acc", email: "bruno@cliente.com", email_bounced_at: null },
      { id: "carla", account_id: "acc", email: "carla@cliente.com", email_bounced_at: null },
    ],
  };
  return { tabelas, admin: bancoFalso(tabelas) };
}

const m = (p: Partial<MensagemDaEntrada>): MensagemDaEntrada => ({
  uid: 101,
  de: null,
  assunto: "",
  data: new Date("2026-10-05T11:00:00Z"),
  cabecalhos: {},
  ...p,
});

const leitura = (mensagens: MensagemDaEntrada[]) =>
  vi.fn<typeof lerCaixaDeEntrada>(async (): Promise<ResultadoDaLeitura> => ({ ok: true, estado: { uidValidity: 7, ultimoUid: 105 }, mensagens }));

describe("processarCaixasDeEntrada", () => {
  it("resposta casada pelo Message-ID: registra, para a cadência e guarda onde parou", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario();
    const ler = leitura([m({ de: "ana@cliente.com", assunto: "Re: Ideia", cabecalhos: { "in-reply-to": ENVIO_ANA } })]);

    const r = await processarCaixasDeEntrada(admin, AGORA, { lerEntrada: ler });

    expect(r).toEqual({ caixasLidas: 1, respostas: 1, bounces: 0, erros: 0 });
    // só a caixa com IMAP, com o estado salvo
    expect(ler).toHaveBeenCalledTimes(1);
    expect(ler.mock.calls[0][0]).toMatchObject({ host: "imap.umbler.com", username: "hello@agenciabyte.com", password: "segredo" });
    expect(ler.mock.calls[0][1]).toEqual({ uidValidity: 7, ultimoUid: 100 });

    const ana = tabelas.email_cadence_enrollments.find((i) => i.id === "ins-ana")!;
    expect(ana).toMatchObject({ status: "parada", motivo_parada: "respondeu", respondeu_em: "2026-10-05T11:00:00.000Z" });
    const eventos = tabelas.email_cadence_events.filter((e) => e.enrollment_id === "ins-ana").map((e) => e.tipo);
    expect(eventos).toEqual(["email_enviado", "respondido", "parada"]);
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-bruno")!.status).toBe("ativa");

    expect(tabelas.email_mailboxes[0]).toMatchObject({
      imap_inbox_last_uid: 105,
      imap_inbox_error: null,
      imap_inbox_checked_at: AGORA.toISOString(),
    });
  });

  it("sem Message-ID, casa pelo remetente — só entre quem recebeu e-mail desta caixa", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario();
    await processarCaixasDeEntrada(admin, AGORA, {
      lerEntrada: leitura([
        m({ uid: 101, de: "ana@cliente.com", assunto: "Oi, pode me ligar?" }), // Ana recebeu desta caixa
        m({ uid: 102, de: "carla@cliente.com", assunto: "Oi" }), // Carla nunca recebeu
      ]),
    });
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-ana")!.motivo_parada).toBe("respondeu");
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-carla")!.status).toBe("ativa");
  });

  it("cadência que não para em resposta: só registra (o ramo 'Respondeu?' passa a dar Sim)", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario({ paradaEmResposta: false });
    await processarCaixasDeEntrada(admin, AGORA, {
      lerEntrada: leitura([m({ de: "ana@cliente.com", cabecalhos: { "in-reply-to": ENVIO_ANA } })]),
    });
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-ana")).toMatchObject({ status: "ativa", respondeu_em: "2026-10-05T11:00:00.000Z" });
  });

  it("bounce permanente: marca o contato, registra e para; resposta automática e atraso não fazem nada", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario();
    const r = await processarCaixasDeEntrada(admin, AGORA, {
      lerEntrada: leitura([
        m({
          uid: 101,
          de: "mailer-daemon@smtp.umbler.com",
          assunto: "Undelivered Mail Returned to Sender",
          cabecalhos: { "content-type": "multipart/report; report-type=delivery-status" },
          corpo: `Final-Recipient: rfc822; bruno@cliente.com\r\nAction: failed\r\nStatus: 5.1.1\r\n\r\nMessage-ID: ${ENVIO_BRUNO}\r\n`,
        }),
        m({ uid: 102, de: "ana@cliente.com", assunto: "Resposta automática: Ideia", cabecalhos: { "in-reply-to": ENVIO_ANA } }),
        m({
          uid: 103,
          de: "mailer-daemon@smtp.umbler.com",
          assunto: "Delayed Mail (still being retried)",
          cabecalhos: { "content-type": "multipart/report; report-type=delivery-status" },
          corpo: `Final-Recipient: rfc822; ana@cliente.com\r\nAction: delayed\r\nStatus: 4.4.1\r\nMessage-ID: ${ENVIO_ANA}\r\n`,
        }),
      ]),
    });
    expect(r).toMatchObject({ respostas: 0, bounces: 1 });
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-bruno")).toMatchObject({
      status: "parada",
      motivo_parada: "bounce",
      bounce_em: AGORA.toISOString(),
    });
    expect(tabelas.contacts.find((c) => c.id === "bruno")!.email_bounced_at).toBe(AGORA.toISOString());
    const bounce = tabelas.email_cadence_events.find((e) => e.tipo === "bounce")!;
    expect(bounce.metadata).toEqual({ caixa_id: "cx1", destinatario: "bruno@cliente.com", status: "5.1.1" });
    // Ana: nada mudou
    expect(tabelas.email_cadence_enrollments.find((i) => i.id === "ins-ana")).toMatchObject({ status: "ativa", respondeu_em: null, bounce_em: null });
  });

  it("a mesma resposta lida de novo não duplica eventos", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario({ paradaEmResposta: false });
    const resposta = m({ de: "ana@cliente.com", cabecalhos: { "in-reply-to": ENVIO_ANA } });
    await processarCaixasDeEntrada(admin, AGORA, { lerEntrada: leitura([resposta]) });
    tabelas.email_mailboxes[0].imap_inbox_checked_at = null; // libera nova leitura
    const r = await processarCaixasDeEntrada(admin, AGORA, { lerEntrada: leitura([resposta]) });
    expect(r.respostas).toBe(0);
    expect(tabelas.email_cadence_events.filter((e) => e.tipo === "respondido")).toHaveLength(1);
  });

  it("lida há menos de 3 minutos: pula; erro de IMAP fica gravado na caixa", async () => {
    const { processarCaixasDeEntrada } = await import("./caixa-de-entrada");
    const { tabelas, admin } = await cenario();
    tabelas.email_mailboxes[0].imap_inbox_checked_at = new Date(AGORA.getTime() - 60_000).toISOString();
    const ler = leitura([]);
    expect((await processarCaixasDeEntrada(admin, AGORA, { lerEntrada: ler })).caixasLidas).toBe(0);
    expect(ler).not.toHaveBeenCalled();

    tabelas.email_mailboxes[0].imap_inbox_checked_at = null;
    const falha = vi.fn(async (): Promise<ResultadoDaLeitura> => ({ ok: false, erro: "Login failed" }));
    const r = await processarCaixasDeEntrada(admin, AGORA, { lerEntrada: falha });
    expect(r).toMatchObject({ caixasLidas: 0, erros: 1 });
    expect(tabelas.email_mailboxes[0]).toMatchObject({ imap_inbox_error: "Login failed", imap_inbox_last_uid: 100 });
  });
});
