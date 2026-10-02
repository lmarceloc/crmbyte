/**
 * Link de conversa no WhatsApp (wa.me) a partir de um telefone livre.
 * Só dígitos; 10 ou 11 dígitos sem DDI são tratados como números do Brasil
 * (prefixa 55), a menos que comece com "+". Telefone vazio ou curto demais (< 8 dígitos) → null.
 */
export function linkWhatsapp(phone?: string | null): string | null {
  const bruto = (phone ?? "").trim();
  let d = bruto.replace(/\D/g, "");
  if (d.length < 8) return null;
  // "+" indica que o DDI já está no número (ex.: +1 415 555 0100)
  if (!bruto.startsWith("+") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return `https://wa.me/${d}`;
}

/** Telefone para exibição; "—" quando não há. */
export function telefoneFormatado(phone?: string | null): string {
  const t = (phone ?? "").trim();
  return t || "—";
}
