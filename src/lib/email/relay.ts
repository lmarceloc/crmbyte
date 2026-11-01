// Relay de e-mail: com EMAIL_RELAY_URL definida, o CRM (Worker da Cloudflare) não abre
// socket SMTP/IMAP — pede por HTTPS para um servidor fora da Cloudflare (relay-email/),
// que fala com o provedor a partir de um IP fixo. Os IPs de saída do Worker são
// compartilhados e mudam; a Umbler bloqueia parte deles e o envio para.
//
// Este arquivo é o lado do CRM (cliente). O servidor está em relay-servidor.ts.

export const OPERACOES_DO_RELAY = [
  "smtp/enviar",
  "smtp/verificar",
  "imap/copiar",
  "imap/verificar",
  "imap/ler",
] as const;
export type OperacaoDoRelay = (typeof OPERACOES_DO_RELAY)[number];

/** Envio pode ficar até ~1 min no servidor SMTP lento; o resto tem teto de 15 s no relay. */
const LIMITE_MS = 90_000;

export class RelayError extends Error {}

export function relayAtivo(): boolean {
  return !!process.env.EMAIL_RELAY_URL?.trim();
}

/** Chama uma operação no relay. Lança RelayError se o relay não responder ou recusar. */
export async function chamarRelay<T>(op: OperacaoDoRelay, corpo: unknown, limiteMs = LIMITE_MS): Promise<T> {
  const base = (process.env.EMAIL_RELAY_URL ?? "").trim().replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/${op}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.EMAIL_RELAY_SECRET ?? ""}`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(limiteMs),
    });
  } catch (e) {
    throw new RelayError(`Relay de e-mail sem resposta: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new RelayError(`Relay de e-mail respondeu ${res.status}: ${texto.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
