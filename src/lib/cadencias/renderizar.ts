import { partesDoNome, separarNome, type NomeDoContato } from "@/lib/contacts/nome";

// Variáveis {{chave}} em assunto/corpo. Variável desconhecida ou sem dado
// FICA VISÍVEL no texto — sinal de dado faltando é menos enganoso que vazio.

export const VARIAVEIS = [
  { chave: "nome", rotulo: "Nome", exemplo: "Mariana" },
  { chave: "sobrenome", rotulo: "Sobrenome", exemplo: "Souza" },
  { chave: "nome_completo", rotulo: "Nome completo", exemplo: "Mariana Souza" },
  { chave: "empresa", rotulo: "Empresa", exemplo: "Papel Sul" },
  { chave: "cargo", rotulo: "Cargo", exemplo: "Diretora comercial" },
  { chave: "vendedor", rotulo: "Vendedor", exemplo: "Luiz" },
  { chave: "segmento", rotulo: "Segmento", exemplo: "Papel e celulose" },
  { chave: "link_agenda", rotulo: "Link da agenda", exemplo: "https://cal.com/luiz/30min" },
] as const;

/** Aceita em cadências já escritas, mas não aparece mais na lista: é igual a `{{nome}}`. */
const VARIAVEIS_LEGADAS = ["primeiro_nome"] as const;

export type DadosDoLead = Partial<
  Record<(typeof VARIAVEIS)[number]["chave"] | (typeof VARIAVEIS_LEGADAS)[number], string | null>
>;

const RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderizar(texto: string, dados: DadosDoLead): string {
  return texto.replace(RE, (inteiro, chave: string) => {
    const valor = (dados as Record<string, string | null | undefined>)[chave];
    return valor && valor.trim() ? valor : inteiro;
  });
}

export function renderizarExemplo(texto: string): string {
  const dados: Record<string, string> = {};
  for (const v of VARIAVEIS) dados[v.chave] = v.exemplo;
  dados.primeiro_nome = dados.nome;
  return renderizar(texto, dados);
}

export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set<string>([...VARIAVEIS.map((v) => v.chave), ...VARIAVEIS_LEGADAS]);
  const achadas = new Set<string>();
  for (const m of texto.matchAll(RE)) {
    if (!conhecidas.has(m[1])) achadas.add(m[1]);
  }
  return [...achadas];
}

export function primeiroNome(nome: string | null | undefined): string | null {
  return separarNome(nome).nome;
}

/**
 * Variáveis de nome do lead. Se o contato tem nome e sobrenome gravados em campos
 * separados, são eles; senão o `name` é dividido na primeira palavra.
 */
export function variaveisDeNome(contato: NomeDoContato | null | undefined): DadosDoLead {
  const { nome, sobrenome, completo } = partesDoNome(contato);
  return { nome, primeiro_nome: nome, sobrenome, nome_completo: completo };
}
