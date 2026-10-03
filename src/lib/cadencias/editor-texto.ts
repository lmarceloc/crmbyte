// Operações de edição do corpo do e-mail (Markdown simples) sobre um texto e
// uma seleção. Funções puras: devolvem o novo texto + seleção, ou null quando
// não há o que fazer (aí o editor deixa o navegador agir, ex.: Tab normal).

export interface Edicao {
  valor: string;
  ini: number;
  fim: number;
}

const LISTA = /^([ \t]*)([-*•])[ \t]+(.*)$/;
const MARCADOR_SOZINHO = /^([ \t]*)[-*]$/;
const MARCADOR = "•";
const RECUO = "  ";
const RECUO_MAXIMO = 5 * RECUO.length;

const inicioDaLinha = (v: string, pos: number) => v.lastIndexOf("\n", pos - 1) + 1;
const fimDaLinha = (v: string, pos: number) => {
  const i = v.indexOf("\n", pos);
  return i === -1 ? v.length : i;
};

/** Faixa [de, ate) das linhas tocadas pela seleção (não inclui a última se a seleção só encosta nela). */
function faixaDeLinhas(v: string, ini: number, fim: number): [number, number] {
  const de = inicioDaLinha(v, ini);
  const ateRef = fim > ini && v[fim - 1] === "\n" ? fim - 1 : fim;
  return [de, fimDaLinha(v, ateRef)];
}

export function alternarNegrito(v: string, ini: number, fim: number): Edicao {
  const sel = v.slice(ini, fim);
  if (v.slice(ini - 2, ini) === "**" && v.slice(fim, fim + 2) === "**" && ini >= 2) {
    return { valor: v.slice(0, ini - 2) + sel + v.slice(fim + 2), ini: ini - 2, fim: fim - 2 };
  }
  if (sel.length >= 4 && sel.startsWith("**") && sel.endsWith("**")) {
    const dentro = sel.slice(2, -2);
    return { valor: v.slice(0, ini) + dentro + v.slice(fim), ini, fim: ini + dentro.length };
  }
  return { valor: `${v.slice(0, ini)}**${sel}**${v.slice(fim)}`, ini: ini + 2, fim: fim + 2 };
}

/** Texto e URL de um link para o trecho selecionado (ou vazio). */
export function inserirLink(v: string, ini: number, fim: number, texto: string, url: string): Edicao {
  const md = `[${texto.replace(/([[\]\\])/g, "\\$1")}](${url.trim()})`;
  const pos = ini + md.length;
  return { valor: v.slice(0, ini) + md + v.slice(fim), ini: pos, fim: pos };
}

export function urlValida(url: string): boolean {
  return /^(https?:\/\/[^\s)"'<>]+|mailto:[^\s)"'<>]+)$/i.test(url.trim());
}

/** Liga/desliga a lista nas linhas selecionadas. */
export function alternarLista(v: string, ini: number, fim: number): Edicao {
  const [de, ate] = faixaDeLinhas(v, ini, fim);
  const linhas = v.slice(de, ate).split("\n");
  const naoVazias = linhas.filter((l) => l.trim() !== "");
  const todasSaoLista = naoVazias.length > 0 && naoVazias.every((l) => LISTA.test(l));
  const novas = linhas.map((l) => {
    if (l.trim() === "") return todasSaoLista ? l : l === "" ? `${MARCADOR} ` : l;
    const m = LISTA.exec(l);
    if (todasSaoLista) return m ? m[3] : l;
    return m ? l : `${/^[ \t]*/.exec(l)![0]}${MARCADOR} ${l.trimStart()}`;
  });
  const bloco = novas.join("\n");
  const valor = v.slice(0, de) + bloco + v.slice(ate);
  const fimNovo = de + bloco.length;
  // cursor sozinho: fica no fim da linha (depois do marcador, se acabou de nascer)
  return ini === fim ? { valor, ini: fimNovo, fim: fimNovo } : { valor, ini: de, fim: fimNovo };
}

/**
 * Tab / Shift+Tab em itens de lista: aninha (+1) ou sobe (-1). Um "*" ou "-"
 * sozinho na linha vira item (aninhado sob o item anterior, se houver).
 * Devolve null se nenhuma linha selecionada é item de lista.
 */
export function mudarNivelDaLista(v: string, ini: number, fim: number, delta: 1 | -1): Edicao | null {
  const [de, ate] = faixaDeLinhas(v, ini, fim);
  const linhas = v.slice(de, ate).split("\n");
  let mudou = false;
  let deslocIni = 0;
  let deslocFim = 0;
  const anterior = de > 0 ? v.slice(inicioDaLinha(v, de - 1), de - 1) : "";

  const novas = linhas.map((l, i) => {
    let nova = l;
    const sozinho = MARCADOR_SOZINHO.exec(l);
    if (sozinho && delta === 1) {
      const ant = i === 0 ? anterior : linhas[i - 1];
      const mAnt = LISTA.exec(ant);
      const recuo = mAnt ? Math.min(mAnt[1].replace(/\t/g, RECUO).length + RECUO.length, RECUO_MAXIMO) : 0;
      nova = `${" ".repeat(recuo)}${MARCADOR} `;
    } else if (LISTA.test(l)) {
      const recuoAtual = /^[ \t]*/.exec(l)![0].replace(/\t/g, RECUO).length;
      if (delta === 1) {
        if (recuoAtual >= RECUO_MAXIMO) return l;
        nova = RECUO + l.replace(/^\t/, RECUO);
      } else {
        if (recuoAtual === 0) return l;
        nova = l.replace(/^\t/, RECUO).replace(new RegExp(`^ {1,${RECUO.length}}`), "");
      }
    } else {
      return l;
    }
    mudou = true;
    const d = nova.length - l.length;
    if (i === 0) deslocIni = d;
    deslocFim += d;
    return nova;
  });
  if (!mudou) return null;
  const bloco = novas.join("\n");
  return {
    valor: v.slice(0, de) + bloco + v.slice(ate),
    ini: Math.max(de, ini + deslocIni),
    fim: Math.max(de, fim + deslocFim),
  };
}

/** Enter dentro de um item: novo item no mesmo nível; em item vazio, sai da lista. */
export function continuarLista(v: string, pos: number): Edicao | null {
  const de = inicioDaLinha(v, pos);
  const linhaAteAqui = v.slice(de, pos);
  const m = LISTA.exec(linhaAteAqui) ?? (/^[ \t]*[-*•][ \t]+$/.test(linhaAteAqui) ? /^([ \t]*)([-*•])[ \t]+()$/.exec(linhaAteAqui) : null);
  if (!m) return null;
  const [, recuo, , conteudo] = m;
  if (conteudo.trim() === "" && v.slice(pos, fimDaLinha(v, pos)).trim() === "") {
    // item vazio: apaga o marcador e fica numa linha limpa
    const fimLinha = fimDaLinha(v, pos);
    return { valor: v.slice(0, de) + v.slice(fimLinha), ini: de, fim: de };
  }
  const novo = `\n${recuo}${MARCADOR} `;
  const valor = v.slice(0, pos) + novo + v.slice(pos);
  const p = pos + novo.length;
  return { valor, ini: p, fim: p };
}

/**
 * Digitou "* " ou "- " no começo da linha: troca pelo marcador "•", para o item
 * aparecer como bolinha no campo (o "**" do negrito não é afetado).
 */
export function converterMarcadorDigitado(v: string, pos: number): Edicao | null {
  const de = inicioDaLinha(v, pos);
  const m = /^([ \t]*)[-*] $/.exec(v.slice(de, pos));
  if (!m) return null;
  const novo = `${m[1]}${MARCADOR} `;
  const p = de + novo.length;
  return { valor: v.slice(0, de) + novo + v.slice(pos), ini: p, fim: p };
}
