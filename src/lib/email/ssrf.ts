// Anti-SSRF para host SMTP: resolve DNS e recusa IP interno/metadata.
// Roda ao salvar a caixa E a cada envio (o DNS pode mudar depois).
import dns from "dns/promises";
import net from "net";

export function ipEInterno(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    if (l.startsWith("fc") || l.startsWith("fd")) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return ipEInterno(m[1]);
    return false;
  }
  return true; // não é IP válido: trata como inseguro
}

export class DestinoInseguroError extends Error {}

export async function assertDestinoResolvidoSeguro(host: string): Promise<void> {
  const ips = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (ips.length === 0) {
    throw new DestinoInseguroError("Não foi possível resolver o servidor SMTP informado.");
  }
  if (ips.some(ipEInterno)) {
    throw new DestinoInseguroError("O servidor SMTP aponta para um endereço interno e foi recusado.");
  }
}
