/** Normaliza site/LinkedIn digitado: prefixa https:// e só aceita http/https. */
export function normalizarUrl(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  if (!v) return null;
  const comProtocolo = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(comProtocolo);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Para renderizar link externo: devolve a URL só se for http/https. */
export function linkExterno(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function rotuloDeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}
