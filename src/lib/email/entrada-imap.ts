// Leitura da caixa de entrada (INBOX) por IMAP, só leitura (não marca nada
// como lido). Server-only. Guarda até qual UID já leu; na primeira leitura —
// ou quando o servidor renumera a pasta (UIDVALIDITY mudou) — olha só os
// últimos dias, para não varrer anos de e-mail.
import { lerCabecalhos, pareceBounce, type MensagemDaEntrada } from "./entrada";
import { comConexao, descreverErroImap, type ClienteImap, type ConfigImap, type DependenciasImap } from "./imap";

interface EnvelopeImap {
  date?: Date | string;
  subject?: string;
  messageId?: string;
  from?: { address?: string }[];
}

interface MensagemImap {
  uid: number;
  envelope?: EnvelopeImap;
  headers?: Buffer;
  source?: Buffer;
}

/** O pedaço do ImapFlow usado para ler — permite um falso nos testes. */
export interface ClienteImapLeitura extends ClienteImap {
  mailboxOpen(path: string, opcoes?: { readOnly?: boolean }): Promise<{ uidValidity: bigint | number; uidNext: number }>;
  search(consulta: { since?: Date; uid?: string }, opcoes: { uid: true }): Promise<number[] | false | undefined>;
  fetchAll(
    faixa: string,
    consulta: { uid: true; envelope?: boolean; headers?: string[] },
    opcoes: { uid: true },
  ): Promise<MensagemImap[]>;
  fetchOne(uid: string, consulta: { source: { maxLength: number } }, opcoes: { uid: true }): Promise<MensagemImap | false | undefined>;
}

export interface EstadoDaEntrada {
  uidValidity: number | null;
  ultimoUid: number | null;
}

export type ResultadoDaLeitura =
  | { ok: true; estado: EstadoDaEntrada; mensagens: MensagemDaEntrada[] }
  | { ok: false; erro: string };

export interface OpcoesDaLeitura {
  /** Mensagens por leitura; o resto fica para a próxima. */
  max?: number;
  /** Quantos dias olhar na primeira leitura. */
  desdeDias?: number;
  agora?: Date;
}

const CABECALHOS = [
  "message-id",
  "in-reply-to",
  "references",
  "auto-submitted",
  "x-autoreply",
  "x-autorespond",
  "x-autoresponder",
  "precedence",
  "content-type",
  "x-failed-recipients",
];
/** O relatório de entrega fica no começo do bounce; não precisa baixar anexos. */
const BYTES_DO_BOUNCE = 64 * 1024;
const DIA_MS = 24 * 60 * 60_000;

function paraMensagem(m: MensagemImap): MensagemDaEntrada {
  const cabecalhos = m.headers ? lerCabecalhos(m.headers.toString("utf8")) : {};
  const env = m.envelope ?? {};
  if (env.messageId && !cabecalhos["message-id"]) cabecalhos["message-id"] = env.messageId;
  const data = env.date ? new Date(env.date) : null;
  return {
    uid: m.uid,
    de: env.from?.[0]?.address?.trim().toLowerCase() || null,
    assunto: (env.subject ?? "").trim(),
    data: data && !Number.isNaN(data.getTime()) ? data : null,
    cabecalhos,
  };
}

/** Lê as mensagens novas da INBOX desde `estado`. Nunca lança. */
export async function lerCaixaDeEntrada(
  cfg: ConfigImap,
  estado: EstadoDaEntrada,
  opcoes: OpcoesDaLeitura = {},
  deps: DependenciasImap<ClienteImapLeitura> = {},
): Promise<ResultadoDaLeitura> {
  const max = opcoes.max ?? 100;
  const desde = new Date((opcoes.agora ?? new Date()).getTime() - (opcoes.desdeDias ?? 14) * DIA_MS);
  try {
    return await comConexao<ResultadoDaLeitura, ClienteImapLeitura>(cfg, deps, async (c) => {
      const pasta = await c.mailboxOpen("INBOX", { readOnly: true });
      const validade = Number(pasta.uidValidity);
      const ultimo = estado.uidValidity === validade ? estado.ultimoUid : null;

      let uids: number[];
      if (ultimo !== null) {
        if (pasta.uidNext <= ultimo + 1) return { ok: true, estado: { uidValidity: validade, ultimoUid: ultimo }, mensagens: [] };
        // "N:*" devolve a última mensagem mesmo se todas forem menores que N: filtra
        uids = ((await c.search({ uid: `${ultimo + 1}:*` }, { uid: true })) || []).filter((u) => u > ultimo);
      } else {
        uids = (await c.search({ since: desde }, { uid: true })) || [];
      }
      uids.sort((a, b) => a - b);
      // continuação: as mais antigas primeiro (o resto vem no próximo ciclo);
      // primeira leitura: só as mais recentes
      const lote = ultimo !== null ? uids.slice(0, max) : uids.slice(-max);
      const novoUltimo = lote.length ? lote[lote.length - 1] : Math.max(ultimo ?? 0, pasta.uidNext - 1);
      if (lote.length === 0) return { ok: true, estado: { uidValidity: validade, ultimoUid: novoUltimo }, mensagens: [] };

      const brutas = await c.fetchAll(lote.join(","), { uid: true, envelope: true, headers: CABECALHOS }, { uid: true });
      const mensagens = brutas.map(paraMensagem).sort((a, b) => a.uid - b.uid);
      for (const m of mensagens) {
        if (!pareceBounce(m)) continue;
        const completa = await c.fetchOne(String(m.uid), { source: { maxLength: BYTES_DO_BOUNCE } }, { uid: true });
        if (completa && completa.source) m.corpo = completa.source.toString("utf8");
      }
      return { ok: true, estado: { uidValidity: validade, ultimoUid: novoUltimo }, mensagens };
    });
  } catch (e) {
    return { ok: false, erro: descreverErroImap(e) };
  }
}
