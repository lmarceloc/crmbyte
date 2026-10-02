// Autenticação dos endpoints de cron: Bearer ou x-cron-secret, comparação em
// tempo constante, FAIL-CLOSED se nenhum segredo estiver configurado.
import crypto from "crypto";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest();

export function autorizaCron(request: Request): boolean {
  const segredos = [process.env.CRON_SECRET, process.env.AUTOMATION_CRON_SECRET].filter(
    (s): s is string => !!s,
  );
  if (segredos.length === 0) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const enviado = bearer ?? request.headers.get("x-cron-secret");
  if (!enviado) return false;
  const h = sha(enviado);
  return segredos.some((s) => crypto.timingSafeEqual(h, sha(s)));
}
