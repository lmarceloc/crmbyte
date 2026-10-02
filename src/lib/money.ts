/** Entrada/saída numérica em pt-BR para preços e quantidades. */

/** "7.000,50" | "7000.5" | "R$ 7.000" → 7000.5 / 7000.5 / 7000. NaN → null. */
export function parseValorBr(texto: string): number | null {
  let s = texto.replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-") return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "7.000" = sete mil
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 7000.5 → "7.000,50" (para preencher campos de edição). */
export function valorParaCampo(n: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** Moeda com centavos (preços de produtos). Nunca lança em código ISO inválido. */
export function formatMoeda(valor: number, moeda = "BRL"): string {
  const n = Number.isFinite(valor) ? valor : 0;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda.trim() || "BRL" }).format(n);
  } catch {
    return `${moeda} ${valorParaCampo(n)}`;
  }
}
