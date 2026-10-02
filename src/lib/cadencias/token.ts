// Token HMAC dos links públicos (pixel de abertura e descadastro).
// Um token por FINALIDADE (campo `fin`): quem tem a URL do pixel não consegue
// descadastrar. Sem `exp`: o pixel precisa valer enquanto o e-mail existir.
import crypto from "crypto";
import { z } from "zod";

export type FinalidadeDoToken = "pixel" | "descadastro";

const payloadSchema = z.object({
  fin: z.enum(["pixel", "descadastro"]),
  enrollment_id: z.string().uuid(),
  account_id: z.string().uuid(),
  cadence_id: z.string().uuid(),
  passo_id: z.string(),
});
export type PayloadDoToken = z.infer<typeof payloadSchema>;

/** Falha FECHADO: sem segredo configurado não assina nem aceita token. */
function segredo(): string {
  const s = process.env.CADENCIA_TOKEN_SECRET || process.env.CRON_SECRET;
  if (!s || s.length < 16) {
    throw new Error("CADENCIA_TOKEN_SECRET não configurado (mín. 16 caracteres).");
  }
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function assinar(corpo: string): Buffer {
  return crypto.createHmac("sha256", segredo()).update(corpo).digest();
}

export function assinarToken(payload: PayloadDoToken): string {
  const corpo = b64(JSON.stringify(payload));
  return `${corpo}.${b64(assinar(corpo))}`;
}

export function verificarToken(
  token: string,
  finalidade: FinalidadeDoToken,
): PayloadDoToken | null {
  try {
    const partes = token.split(".");
    if (partes.length !== 2) return null;
    const [corpo, assinatura] = partes;
    const esperado = assinar(corpo);
    const recebido = Buffer.from(assinatura, "base64url");
    if (recebido.length !== esperado.length) return null;
    if (!crypto.timingSafeEqual(recebido, esperado)) return null;
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.fin !== finalidade) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
