// Menções (@fulano) em notas. O texto guarda o "@handle" literal; os ids vêm de
// casar os handles com os membros da conta (funciona digitado à mão também).

export interface Membro {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface MembroComHandle extends Membro {
  /** Sem @, sem acento, minúsculo. Ex.: "marcos" ou "marcos.silva" se houver dois Marcos. */
  handle: string;
  /** Nome para exibir. */
  nome: string;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const limpar = (s: string) => semAcento(s).replace(/[^\p{L}\p{N}_]/gu, "");

function partesDoNome(m: Membro): string[] {
  const base = m.full_name?.trim() || m.email?.split("@")[0] || "usuario";
  return base.split(/\s+/).map(limpar).filter(Boolean);
}

/** Dá a cada membro um handle único: primeiro nome; se repetir, primeiro.último. */
export function comHandles(membros: Membro[]): MembroComHandle[] {
  const primeiros = new Map<string, number>();
  for (const m of membros) {
    const p = partesDoNome(m)[0] ?? "usuario";
    primeiros.set(p, (primeiros.get(p) ?? 0) + 1);
  }
  const usados = new Set<string>();
  return membros.map((m) => {
    const partes = partesDoNome(m);
    let handle = partes[0] ?? "usuario";
    if ((primeiros.get(handle) ?? 0) > 1 && partes.length > 1) handle = `${partes[0]}.${partes[partes.length - 1]}`;
    let h = handle;
    for (let n = 2; usados.has(h); n++) h = `${handle}${n}`;
    usados.add(h);
    return { ...m, handle: h, nome: m.full_name?.trim() || m.email || "Usuário" };
  });
}

// "@" no começo do texto ou depois de espaço/pontuação; handle com letras, números, _ e .
const REGEX_MENCAO = /(^|[\s(\[{>])@([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)/gu;

/** Membros mencionados no texto (sem repetir). */
export function extrairMencoes(texto: string, membros: MembroComHandle[]): MembroComHandle[] {
  const porHandle = new Map(membros.map((m) => [m.handle, m]));
  const achados = new Map<string, MembroComHandle>();
  for (const [, , bruto] of texto.matchAll(REGEX_MENCAO)) {
    const h = semAcento(bruto);
    const m = porHandle.get(h) ?? porHandle.get(h.replace(/\.+$/, ""));
    if (m) achados.set(m.user_id, m);
  }
  return [...achados.values()];
}

export type PedacoDeTexto = { texto: string; mencao?: MembroComHandle };

/** Quebra o texto em pedaços para destacar as menções reconhecidas. */
export function dividirPorMencoes(texto: string, membros: MembroComHandle[]): PedacoDeTexto[] {
  const porHandle = new Map(membros.map((m) => [m.handle, m]));
  const pedacos: PedacoDeTexto[] = [];
  let cursor = 0;
  for (const m of texto.matchAll(REGEX_MENCAO)) {
    const [inteiro, antes, bruto] = m;
    const membro = porHandle.get(semAcento(bruto));
    if (!membro) continue;
    const inicio = (m.index ?? 0) + antes.length;
    if (inicio > cursor) pedacos.push({ texto: texto.slice(cursor, inicio) });
    pedacos.push({ texto: `@${bruto}`, mencao: membro });
    cursor = (m.index ?? 0) + inteiro.length;
  }
  if (cursor < texto.length) pedacos.push({ texto: texto.slice(cursor) });
  return pedacos;
}

/**
 * Se o cursor está logo depois de "@algo", devolve a consulta e onde ela
 * começa (posição do "@") — usado para abrir/filtrar o autocomplete.
 */
export function consultaDeMencao(texto: string, cursor: number): { consulta: string; inicio: number } | null {
  const ate = texto.slice(0, cursor);
  const m = /(^|[\s(\[{>])@([\p{L}\p{N}_.]*)$/u.exec(ate);
  if (!m) return null;
  return { consulta: m[2], inicio: cursor - m[2].length - 1 };
}
