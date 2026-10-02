// Variáveis {{chave}} em assunto/corpo. Variável desconhecida ou sem dado
// FICA VISÍVEL no texto — sinal de dado faltando é menos enganoso que vazio.

export const VARIAVEIS = [
  { chave: "primeiro_nome", rotulo: "Primeiro nome", exemplo: "Mariana" },
  { chave: "nome", rotulo: "Nome completo", exemplo: "Mariana Souza" },
  { chave: "empresa", rotulo: "Empresa", exemplo: "Papel Sul" },
  { chave: "cargo", rotulo: "Cargo", exemplo: "Diretora comercial" },
  { chave: "vendedor", rotulo: "Vendedor", exemplo: "Luiz" },
  { chave: "segmento", rotulo: "Segmento", exemplo: "Papel e celulose" },
] as const;

export type DadosDoLead = Partial<Record<(typeof VARIAVEIS)[number]["chave"], string | null>>;

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
  return renderizar(texto, dados);
}

export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS.map((v) => v.chave));
  const achadas = new Set<string>();
  for (const m of texto.matchAll(RE)) {
    if (!conhecidas.has(m[1])) achadas.add(m[1]);
  }
  return [...achadas];
}

export function primeiroNome(nome: string | null | undefined): string | null {
  const n = nome?.trim();
  return n ? n.split(/\s+/)[0] : null;
}
