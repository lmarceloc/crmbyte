// Nome e sobrenome do contato. O banco guarda o nome COMPLETO em `name` e, quando a
// separação é conhecida, `first_name` + `last_name` (migration 056; um gatilho
// mantém os três coerentes). Contato sem separação — os antigos, os do WhatsApp —
// tem o `name` dividido na primeira palavra.

export interface NomeDoContato {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const limpo = (v: string | null | undefined): string | null => v?.trim().replace(/\s+/g, " ") || null;

/** "Mariana Souza Lima" → { nome: "Mariana", sobrenome: "Souza Lima" }. */
export function separarNome(completo: string | null | undefined): { nome: string | null; sobrenome: string | null } {
  const partes = limpo(completo)?.split(" ") ?? [];
  return { nome: partes[0] ?? null, sobrenome: partes.length > 1 ? partes.slice(1).join(" ") : null };
}

/** ("Mariana", "Souza") → "Mariana Souza"; um dos dois vazio também vale. */
export function juntarNome(nome: string | null | undefined, sobrenome: string | null | undefined): string | null {
  return [limpo(nome), limpo(sobrenome)].filter(Boolean).join(" ") || null;
}

/**
 * O que gravar a partir de dois campos de formulário. Com sobrenome, a separação é
 * guardada. Sem ele, só o nome: quem digitou "Maria Silva" inteiro no campo de nome
 * continua sendo dividido pelas cadências, em vez de virar um "nome" de duas palavras.
 */
export function camposDeNome(
  nome: string | null | undefined,
  sobrenome: string | null | undefined,
): { name: string | null; first_name: string | null; last_name: string | null } {
  const n = limpo(nome);
  const s = limpo(sobrenome);
  if (!s) return { name: n, first_name: null, last_name: null };
  return { name: juntarNome(n, s), first_name: n, last_name: s };
}

/** Nome, sobrenome e nome completo do contato: a separação gravada vale; sem ela, divide `name`. */
export function partesDoNome(c: NomeDoContato | null | undefined): {
  nome: string | null;
  sobrenome: string | null;
  completo: string | null;
} {
  const nome = limpo(c?.first_name);
  const sobrenome = limpo(c?.last_name);
  if (nome || sobrenome) return { nome, sobrenome, completo: juntarNome(nome, sobrenome) };
  return { ...separarNome(c?.name), completo: limpo(c?.name) };
}
