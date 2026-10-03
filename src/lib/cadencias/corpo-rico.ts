// Corpo do e-mail da cadência: texto com um subconjunto de Markdown.
//   **negrito**   [texto](https://link)   listas com "- " ou "* " (aninhadas
//   com 2 espaços por nível)   \* \[ \] \( \) \\ para escrever o caractere.
// Texto sem marcação continua valendo como antes (quebra de linha = <br>).
// TODO o HTML é gerado aqui, escapando o resto — nada do que o usuário digita
// vira tag. Só links http(s) e mailto são aceitos.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ESTILO_LISTA = "margin:8px 0;padding-left:24px";
const MARCADOR_LISTA = /^([ \t]*)[-*•][ \t]+(.*)$/;
const NIVEL_MAXIMO = 5;

// 1 escape · 2 negrito · 3-4 link markdown · 5 URL solta
const RE_INLINE =
  /\\([*[\]()\\])|\*\*(.+?)\*\*|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)"'<>]+)\)|(https?:\/\/[^\s<>"']+)/gu;

const PONTUACAO_FINAL = /[.,;:!?)]+$/;
const URL_LONGA = 1800;

export interface OpcoesDoCorpo {
  /** Devolve o href final de um link http(s) (ex.: redirecionador com rastreio). */
  linkar?: (url: string) => string;
}

/** Escapa os caracteres de marcação de um VALOR (ex.: nome do lead) para entrar no corpo. */
export function escaparMarkdown(valor: string): string {
  return valor.replace(/([*[\]()\\])/g, "\\$1");
}

function inline(raw: string, op: OpcoesDoCorpo): string {
  let saida = "";
  let cursor = 0;
  for (const m of raw.matchAll(RE_INLINE)) {
    const inicio = m.index ?? 0;
    saida += esc(raw.slice(cursor, inicio));
    cursor = inicio + m[0].length;
    if (m[1] !== undefined) {
      saida += esc(m[1]);
    } else if (m[2] !== undefined) {
      saida += `<strong>${inline(m[2], op)}</strong>`;
    } else if (m[3] !== undefined) {
      const url = m[4];
      const href = op.linkar && /^https?:/i.test(url) ? op.linkar(url) : url;
      saida += `<a href="${esc(href)}">${esc(m[3])}</a>`;
    } else {
      const visivel = m[5];
      const limpo = visivel.replace(PONTUACAO_FINAL, "");
      const resto = visivel.slice(limpo.length);
      if (limpo.length > URL_LONGA) {
        saida += esc(visivel);
      } else {
        const href = op.linkar ? op.linkar(limpo) : limpo;
        saida += `<a href="${esc(href)}">${esc(limpo)}</a>${esc(resto)}`;
      }
    }
  }
  return saida + esc(raw.slice(cursor));
}

/** Nível de aninhamento a partir da indentação (tab = 2 espaços). */
function nivelDaIndentacao(indent: string): number {
  return Math.min(Math.floor(indent.replace(/\t/g, "  ").length / 2), NIVEL_MAXIMO);
}

function listaEmHtml(itens: { nivel: number; conteudo: string }[], op: OpcoesDoCorpo): string {
  let html = "";
  let aberto = -1; // profundidade do <ul> mais interno aberto
  for (const it of itens) {
    const n = Math.min(it.nivel, aberto + 1); // não pula níveis
    if (n > aberto) {
      html += `<ul style="${ESTILO_LISTA}">`; // abre dentro do <li> anterior (ainda aberto)
      aberto = n;
    } else {
      html += "</li>";
      while (aberto > n) {
        html += "</ul></li>";
        aberto--;
      }
    }
    html += `<li>${inline(it.conteudo, op)}`;
  }
  html += "</li>";
  while (aberto > 0) {
    html += "</ul></li>";
    aberto--;
  }
  return html + "</ul>";
}

export function corpoEmHtml(corpo: string, op: OpcoesDoCorpo = {}): string {
  const linhas = corpo.replace(/\r\n?/g, "\n").split("\n");
  const blocos: string[] = [];
  let texto: string[] = [];
  let lista: { nivel: number; conteudo: string }[] = [];
  let veioDeLista = false;

  const fecharTexto = (antesDeLista: boolean) => {
    // a lista já tem margem própria: linhas em branco coladas nela só abririam um vão duplo
    if (antesDeLista) while (texto.length && texto[texto.length - 1] === "") texto.pop();
    if (texto.length) blocos.push(texto.map((l) => (l === "" ? "" : inline(l, op))).join("<br>\n"));
    texto = [];
  };
  const fecharLista = () => {
    if (lista.length) blocos.push(listaEmHtml(lista, op));
    lista = [];
  };

  for (const linha of linhas) {
    const m = MARCADOR_LISTA.exec(linha);
    if (m) {
      fecharTexto(true);
      lista.push({ nivel: nivelDaIndentacao(m[1]), conteudo: m[2] });
      veioDeLista = true;
    } else {
      if (lista.length) fecharLista();
      if (veioDeLista && texto.length === 0 && linha === "") continue; // vão logo após a lista
      veioDeLista = false;
      texto.push(linha);
    }
  }
  fecharLista();
  fecharTexto(false);
  return blocos.join("\n");
}

/** Versão text/plain: sem marcação, links como "texto (url)", listas com "•". */
export function corpoEmTexto(corpo: string): string {
  const semMarcas = (raw: string): string => {
    let saida = "";
    let cursor = 0;
    for (const m of raw.matchAll(RE_INLINE)) {
      const inicio = m.index ?? 0;
      saida += raw.slice(cursor, inicio);
      cursor = inicio + m[0].length;
      if (m[1] !== undefined) saida += m[1];
      else if (m[2] !== undefined) saida += semMarcas(m[2]);
      else if (m[3] !== undefined) saida += m[3] === m[4] ? m[4] : `${m[3]} (${m[4].replace(/^mailto:/i, "")})`;
      else saida += m[5];
    }
    return saida + raw.slice(cursor);
  };
  return corpo
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((linha) => {
      const m = MARCADOR_LISTA.exec(linha);
      return m ? `${"  ".repeat(nivelDaIndentacao(m[1]))}• ${semMarcas(m[2])}` : semMarcas(linha);
    })
    .join("\n");
}
