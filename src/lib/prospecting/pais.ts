// País-alvo da prospecção B2B. A busca da Treg (`treg.people.search`) é feita por
// cargo e/ou domínio e devolve gente do mundo todo: "supply chain" traz a Argentina
// junto com o Brasil. O filtro roda sobre a localização que o próprio provedor
// devolve, ANTES de o lead virar candidato — assim não se paga a revelação do
// e-mail de quem está fora do país.

export const PAISES = {
  BR: "Brasil",
  PT: "Portugal",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colômbia",
  MX: "México",
  PE: "Peru",
  UY: "Uruguai",
  PY: "Paraguai",
  US: "Estados Unidos",
  ES: "Espanha",
} as const;
export type CodigoPais = keyof typeof PAISES;
export const CODIGOS_PAIS = Object.keys(PAISES) as [CodigoPais, ...CodigoPais[]];

const UFS = [
  "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr",
  "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to",
];
const ESTADOS_BR = [
  "acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "distrito federal", "espirito santo",
  "goias", "maranhao", "mato grosso", "mato grosso do sul", "minas gerais", "para", "paraiba",
  "parana", "pernambuco", "piaui", "rio de janeiro", "rio grande do norte", "rio grande do sul",
  "rondonia", "roraima", "santa catarina", "sao paulo", "sergipe", "tocantins",
  "state of sao paulo", "state of rio de janeiro", "state of minas gerais", "state of parana",
];

/** Nomes (normalizados) pelos quais cada país aparece na localização dos provedores. */
const NOMES: Record<CodigoPais, string[]> = {
  BR: ["brazil", "brasil", "bra"],
  PT: ["portugal", "prt"],
  AR: ["argentina", "arg"],
  CL: ["chile", "chl"],
  CO: ["colombia", "col"],
  MX: ["mexico", "mex"],
  PE: ["peru", "per"],
  UY: ["uruguay", "uruguai", "ury"],
  PY: ["paraguay", "paraguai", "pry"],
  US: ["united states", "united states of america", "usa", "estados unidos", "eua"],
  ES: ["spain", "espana", "espanha", "esp"],
};

/** Outros países frequentes que não estão na lista de opções, para reconhecer o "fora". */
const OUTROS = [
  "canada", "united kingdom", "uk", "england", "germany", "france", "italy", "netherlands", "india",
  "venezuela", "ecuador", "bolivia", "costa rica", "panama", "guatemala", "dominican republic",
  "puerto rico", "china", "japan", "australia", "ireland", "switzerland", "belgium", "poland",
];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Onde o lead está em relação ao país-alvo:
 *  - `dentro`: a localização cita o país (ou, no Brasil, um estado/UF);
 *  - `fora`: a localização termina em outro país reconhecido;
 *  - `desconhecido`: sem localização, ou sem país reconhecível — o lead fica
 *    (é melhor o vendedor descartar à mão que perder um lead bom).
 */
export function situacaoNoPais(location: string | null, pais: CodigoPais): "dentro" | "fora" | "desconhecido" {
  if (!location) return "desconhecido";
  const partes = location.split(/[,;|/-]/).map(normalizar).filter(Boolean);
  if (partes.length === 0) return "desconhecido";

  const ultima = partes[partes.length - 1];
  // a sigla do país só vale no fim: no meio pode ser UF ("Recife, PE" é Pernambuco, não Peru)
  if (ultima === pais.toLowerCase()) return "dentro";
  const doAlvo = new Set([...NOMES[pais], ...(pais === "BR" ? [...UFS, ...ESTADOS_BR] : [])]);
  if (partes.some((p) => doAlvo.has(p))) return "dentro";

  // o país vem no fim ("Buenos Aires, Argentina" / "Cordoba, X, AR")
  const outros = new Set<string>(OUTROS);
  for (const c of CODIGOS_PAIS) {
    if (c === pais) continue;
    for (const n of NOMES[c]) outros.add(n);
    // código ISO de 2 letras só conta com mais de uma parte (senão "PR" sozinho seria ambíguo)
    if (partes.length > 1) outros.add(c.toLowerCase());
  }
  if (outros.has(ultima)) return "fora";
  // nome do país no meio de uma parte mais longa ("Greater Buenos Aires Argentina")
  if ([...outros].some((n) => n.length > 3 && ` ${ultima} `.includes(` ${n} `))) return "fora";
  return "desconhecido";
}
